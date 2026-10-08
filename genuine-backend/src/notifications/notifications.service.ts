import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import nodemailer from 'nodemailer';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import {
  CreateNotificationDto,
  CreateNotificationTemplateDto,
  EmailConfigDto,
  NotificationEventType,
  NotificationRecipientDto,
  NotificationType,
  SMSConfigDto,
  UpdateNotificationTemplateDto,
} from './dto';

const MAX_ATTEMPTS = 5;
const INTERNAL_PERMISSION: Partial<Record<NotificationEventType, string>> = {
  [NotificationEventType.PAYMENT_RECEIVED]: 'payments.view',
  [NotificationEventType.PAYMENT_DUE]: 'sales.view',
  [NotificationEventType.INVOICE_CREATED]: 'sales.view',
  [NotificationEventType.SALES_INVOICE_ISSUED]: 'sales.view',
  [NotificationEventType.LOW_STOCK]: 'inventory.view',
  [NotificationEventType.PURCHASE_ORDER_APPROVED]: 'purchases.view',
  [NotificationEventType.EXPENSE_APPROVED]: 'expenses.view',
  [NotificationEventType.REPORT_GENERATED]: 'reports.view',
};

type EventInput = {
  businessId: string;
  eventType: NotificationEventType;
  referenceId?: string;
  referenceType?: string;
  idempotencyKey?: string;
  subject?: string;
  body?: string;
  variables?: Record<string, unknown>;
  externalRecipients?: Array<{ email?: string; phoneNumber?: string; name: string }>;
};

type EmailSecret = {
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  secure?: boolean;
  apiKey?: string;
};

type SmsSecret = {
  accountSid?: string;
  apiKey?: string;
  username?: string;
  apiSecret?: string;
};

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private worker?: NodeJS.Timeout;
  private scheduledScan?: NodeJS.Timeout;
  private draining = false;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appLogger: LoggerService,
  ) {}

  onModuleInit() {
    // The database is the durable outbox. The worker can be replaced by the job
    // queue in the next phase without changing notification producers.
    this.worker = setInterval(
      () => void this.drainPending().catch((error) => this.logError(error)),
      5000,
    );
    this.worker.unref();
    this.scheduledScan = setInterval(
      () => void this.runScheduledScans().catch((error) => this.logError(error)),
      15 * 60 * 1000,
    );
    this.scheduledScan.unref();
  }

  onModuleDestroy() {
    if (this.worker) clearInterval(this.worker);
    if (this.scheduledScan) clearInterval(this.scheduledScan);
  }

  async enqueuePasswordResetEmail(input: {
    businessId: string;
    email: string;
    firstName: string;
    resetLink: string;
  }) {
    const providerConfigured = await this.prisma.emailConfig.findUnique({
      where: { businessId: input.businessId },
      select: { businessId: true },
    });
    if (!providerConfigured) {
      this.logger.warn(
        `Password reset email not queued: no email provider configured for business ${input.businessId}`,
      );
      return false;
    }

    const safeName = this.escapeHtml(input.firstName || 'there');
    const safeLink = this.escapeHtml(input.resetLink);
    const subject = 'Reset your Genuine account password';
    const body = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#20231f"><h2>Password reset requested</h2><p>Hello ${safeName},</p><p>Use the secure link below to choose a new password. This link expires in one hour and can only be used once.</p><p style="margin:28px 0"><a href="${safeLink}" style="background:#173d31;color:#fff;padding:13px 20px;border-radius:8px;text-decoration:none">Reset password</a></p><p>If you did not request this change, you can ignore this email. Your current password will remain active.</p></div>`;
    const idempotencyKey = `PASSWORD_RESET:${randomBytes(18).toString('hex')}`;

    await this.prisma.notification.create({
      data: {
        businessId: input.businessId,
        type: NotificationType.EMAIL,
        eventType: 'PASSWORD_RESET',
        status: 'PENDING',
        subject,
        body,
        idempotencyKey,
        recipients: {
          create: [{ email: input.email, name: input.firstName || input.email, status: 'PENDING' }],
        },
        logs: {
          create: [
            { recipient: input.email, status: 'PENDING', message: 'Password reset email queued' },
          ],
        },
      },
    });
    return true;
  }

  async createTemplate(businessId: string, dto: CreateNotificationTemplateDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Template name is required');
    try {
      return await this.prisma.notificationTemplate.create({
        data: {
          businessId,
          name,
          type: dto.type,
          eventType: dto.eventType,
          subject: dto.subject.trim(),
          body: dto.body,
          description: dto.description?.trim() || null,
          variables: dto.variables || [],
        },
      });
    } catch (error) {
      this.mapUniqueError(error, 'A template with this name already exists');
      throw error;
    }
  }

  async getTemplateById(businessId: string, id: string) {
    const row = await this.prisma.notificationTemplate.findFirst({ where: { id, businessId } });
    if (!row) throw new NotFoundException('Notification template not found');
    return row;
  }

  async getAllTemplates(
    businessId: string,
    filter: { eventType?: NotificationEventType; type?: NotificationType },
  ) {
    return this.prisma.notificationTemplate.findMany({
      where: {
        businessId,
        ...(filter.eventType && { eventType: filter.eventType }),
        ...(filter.type && { type: filter.type }),
      },
      orderBy: [{ eventType: 'asc' }, { name: 'asc' }],
    });
  }

  async updateTemplate(businessId: string, id: string, dto: UpdateNotificationTemplateDto) {
    const before = await this.prisma.notificationTemplate.findFirst({ where: { id, businessId } });
    if (!before) throw new NotFoundException('Notification template not found');
    const name = dto.name?.trim();
    if (name === '') throw new BadRequestException('Template name is required');
    try {
      return await this.prisma.notificationTemplate.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(dto.subject !== undefined && { subject: dto.subject.trim() }),
          ...(dto.body !== undefined && { body: dto.body }),
          ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
          ...(dto.variables !== undefined && { variables: dto.variables }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
    } catch (error) {
      this.mapUniqueError(error, 'A template with this name already exists');
      throw error;
    }
  }

  async deleteTemplate(businessId: string, id: string) {
    const result = await this.prisma.notificationTemplate.deleteMany({ where: { id, businessId } });
    if (!result.count) throw new NotFoundException('Notification template not found');
  }

  async createNotification(businessId: string, dto: CreateNotificationDto) {
    this.validateRecipients(dto.type, dto.recipients || []);
    const existing = dto.idempotencyKey
      ? await this.prisma.notification.findFirst({
          where: { businessId, idempotencyKey: dto.idempotencyKey },
          select: { id: true },
        })
      : null;
    if (existing) return this.getNotificationById(businessId, existing.id);

    const message = await this.resolveMessage(businessId, dto);
    const userIds = (dto.recipients || []).flatMap((recipient) =>
      recipient.userId ? [recipient.userId] : [],
    );
    if (userIds.length) await this.assertBusinessUsers(businessId, userIds);

    let createdId: string;
    try {
      createdId = await this.prisma.$transaction(async (tx) => {
        const notification = await tx.notification.create({
          data: {
            businessId,
            type: dto.type,
            eventType: dto.eventType,
            status: dto.type === NotificationType.IN_APP ? 'SENT' : 'PENDING',
            subject: message.subject,
            body: message.body,
            referenceId: dto.referenceId,
            referenceType: dto.referenceType,
            idempotencyKey: dto.idempotencyKey,
            sentAt: dto.type === NotificationType.IN_APP ? new Date() : null,
            recipients: {
              create: (dto.recipients || []).map((recipient) => ({
                userId: recipient.userId,
                email: recipient.email,
                phoneNumber: recipient.phoneNumber,
                name: recipient.name.trim(),
                status: dto.type === NotificationType.IN_APP ? 'SENT' : 'PENDING',
                sentAt: dto.type === NotificationType.IN_APP ? new Date() : null,
              })),
            },
            logs: {
              create: (dto.recipients || []).map((recipient) => ({
                recipient: recipient.userId || recipient.email || recipient.phoneNumber || '',
                status: dto.type === NotificationType.IN_APP ? 'SENT' : 'PENDING',
                message:
                  dto.type === NotificationType.IN_APP
                    ? 'Delivered to in-app inbox'
                    : 'Queued for provider delivery',
              })),
            },
          },
        });
        if (dto.type === NotificationType.IN_APP) {
          await tx.inAppNotification.createMany({
            data: userIds.map((userId) => ({ notificationId: notification.id, userId })),
            skipDuplicates: true,
          });
        }
        return notification.id;
      });
    } catch (error) {
      this.mapUniqueError(error, 'Notification idempotency key was already used');
      throw error;
    }
    return this.getNotificationById(businessId, createdId);
  }

  async sendNotificationNow(businessId: string, notificationId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, businessId },
      select: { id: true, status: true, type: true, attemptCount: true },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.type === NotificationType.IN_APP) return this.getNotificationById(businessId, row.id);
    if (row.attemptCount >= MAX_ATTEMPTS && row.status === 'FAILED') {
      throw new ConflictException('Notification exhausted its retry limit');
    }
    const sent = await this.deliver(notificationId, businessId);
    if (!sent)
      throw new ConflictException('Notification is already being processed or is not retryable');
    return this.getNotificationById(businessId, notificationId);
  }

  async getNotificationById(businessId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, businessId },
      include: { recipients: true, logs: { orderBy: { timestamp: 'desc' } } },
    });
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  async getAllNotifications(
    businessId: string,
    filter: {
      status?: string;
      type?: NotificationType;
      eventType?: NotificationEventType;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where: Prisma.NotificationWhereInput = {
      businessId,
      ...(filter.status && { status: filter.status }),
      ...(filter.type && { type: filter.type }),
      ...(filter.eventType && { eventType: filter.eventType }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: {
          id: true,
          type: true,
          eventType: true,
          status: true,
          subject: true,
          attemptCount: true,
          lastAttemptAt: true,
          nextRetryAt: true,
          createdAt: true,
          recipients: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data: rows.map(({ recipients, ...row }) => ({
        ...row,
        recipientCount: recipients.length,
        sentCount: recipients.filter((recipient) => recipient.status === 'SENT').length,
        failedCount: recipients.filter((recipient) => recipient.status === 'FAILED').length,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getInAppNotifications(
    businessId: string,
    userId: string,
    filter: { unreadOnly?: boolean; page?: number; limit?: number },
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where = { userId, user: { businessId }, ...(filter.unreadOnly && { isRead: false }) };
    const [data, total, unreadCount] = await Promise.all([
      this.prisma.inAppNotification.findMany({
        where,
        include: {
          notification: {
            select: {
              id: true,
              type: true,
              eventType: true,
              subject: true,
              body: true,
              referenceId: true,
              referenceType: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inAppNotification.count({ where }),
      this.prisma.inAppNotification.count({
        where: { userId, user: { businessId }, isRead: false },
      }),
    ]);
    return {
      data: data.map((entry) => ({
        ...entry.notification,
        id: entry.id,
        notificationId: entry.notificationId,
        isRead: entry.isRead,
        readAt: entry.readAt,
        createdAt: entry.createdAt,
      })),
      unreadCount,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(businessId: string, userId: string, inboxId: string) {
    const result = await this.prisma.inAppNotification.updateMany({
      where: { id: inboxId, userId, user: { businessId }, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count) return { id: inboxId, isRead: true };
    const existing = await this.prisma.inAppNotification.findFirst({
      where: { id: inboxId, userId, user: { businessId } },
      select: { id: true, isRead: true },
    });
    if (!existing) throw new NotFoundException('In-app notification not found');
    return existing;
  }

  async setEmailConfig(businessId: string, dto: EmailConfigDto) {
    const secret: EmailSecret = {};
    if (dto.provider === 'SMTP') {
      if (!dto.smtpHost?.trim() || !dto.smtpPort || !dto.smtpUsername || !dto.smtpPassword) {
        throw new BadRequestException('SMTP host, port, username and password are required');
      }
      Object.assign(secret, {
        smtpHost: dto.smtpHost.trim(),
        smtpPort: dto.smtpPort,
        smtpUsername: dto.smtpUsername,
        smtpPassword: dto.smtpPassword,
        secure: dto.secure ?? dto.smtpPort === 465,
      });
    } else {
      if (!dto.apiKey?.trim()) throw new BadRequestException('SendGrid API key is required');
      secret.apiKey = dto.apiKey;
    }
    await this.prisma.emailConfig.upsert({
      where: { businessId },
      create: {
        businessId,
        provider: dto.provider,
        fromEmail: dto.fromEmail,
        fromName: dto.fromName.trim(),
        config: this.encrypt(secret),
      },
      update: {
        provider: dto.provider,
        fromEmail: dto.fromEmail,
        fromName: dto.fromName.trim(),
        config: this.encrypt(secret),
      },
    });
    return { message: 'Email configuration saved' };
  }

  async getEmailConfig(businessId: string) {
    const row = await this.prisma.emailConfig.findUnique({ where: { businessId } });
    if (!row) throw new NotFoundException('Email configuration not found');
    return {
      provider: row.provider,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      configured: true,
    };
  }

  async setSmsConfig(businessId: string, dto: SMSConfigDto) {
    const secret: SmsSecret = {};
    if (dto.provider === 'TWILIO') {
      if (!dto.accountSid?.trim() || !dto.apiKey?.trim()) {
        throw new BadRequestException('Twilio account SID and auth token are required');
      }
      secret.accountSid = dto.accountSid;
      secret.apiKey = dto.apiKey;
    } else {
      if (!dto.username?.trim() || !dto.apiKey?.trim()) {
        throw new BadRequestException("Africa's Talking username and API key are required");
      }
      secret.username = dto.username;
      secret.apiKey = dto.apiKey;
    }
    await this.prisma.sMSConfig.upsert({
      where: { businessId },
      create: {
        businessId,
        provider: dto.provider,
        fromNumber: dto.fromNumber.trim(),
        config: this.encrypt(secret),
      },
      update: {
        provider: dto.provider,
        fromNumber: dto.fromNumber.trim(),
        config: this.encrypt(secret),
      },
    });
    return { message: 'SMS configuration saved' };
  }

  async getSmsConfig(businessId: string) {
    const row = await this.prisma.sMSConfig.findUnique({ where: { businessId } });
    if (!row) throw new NotFoundException('SMS configuration not found');
    return { provider: row.provider, fromNumber: row.fromNumber, configured: true };
  }

  async publishEvent(input: EventInput) {
    try {
      await this.persistEvent(input);
    } catch (error) {
      this.logError(error);
    }
  }

  private async persistEvent(input: EventInput) {
    const targets = await this.findEventUsers(input.businessId, input.eventType);
    const defaultMessage = this.defaultEventMessage(input.eventType, input.variables || {});
    const internalMessage =
      input.subject && input.body
        ? { subject: input.subject, body: input.body }
        : await this.eventMessage(
            input.businessId,
            input.eventType,
            NotificationType.IN_APP,
            input.variables || {},
            input.subject || defaultMessage.subject,
            input.body || defaultMessage.body,
          );
    const externalMessage =
      input.subject && input.body
        ? { subject: input.subject, body: input.body }
        : await this.eventMessage(
            input.businessId,
            input.eventType,
            (input.externalRecipients || []).some((item) => item.email)
              ? NotificationType.EMAIL
              : NotificationType.SMS,
            input.variables || {},
            input.subject || defaultMessage.subject,
            input.body || defaultMessage.body,
          );
    const internalKey = input.idempotencyKey || this.eventKey(input, 'IN_APP');
    if (targets.length) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const notification = await tx.notification.create({
            data: {
              businessId: input.businessId,
              type: NotificationType.IN_APP,
              eventType: input.eventType,
              status: 'SENT',
              subject: internalMessage.subject,
              body: internalMessage.body,
              referenceId: input.referenceId,
              referenceType: input.referenceType,
              idempotencyKey: internalKey,
              sentAt: new Date(),
              recipients: {
                create: targets.map((user) => ({
                  userId: user.id,
                  name: this.userName(user),
                  status: 'SENT',
                  sentAt: new Date(),
                })),
              },
              logs: {
                create: targets.map((user) => ({
                  recipient: user.id,
                  status: 'SENT',
                  message: 'Delivered to in-app inbox',
                })),
              },
              inboxEntries: { create: targets.map((user) => ({ userId: user.id })) },
            },
          });
          this.logger.debug(`Created in-app notification ${notification.id}`);
        });
      } catch (error) {
        if ((error as Prisma.PrismaClientKnownRequestError)?.code !== 'P2002') this.logError(error);
      }
    }
    for (const recipient of input.externalRecipients || []) {
      const destination = recipient.email || recipient.phoneNumber;
      if (!destination) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.notification.create({
            data: {
              businessId: input.businessId,
              type: recipient.email ? NotificationType.EMAIL : NotificationType.SMS,
              eventType: input.eventType,
              status: 'PENDING',
              subject: externalMessage.subject,
              body: externalMessage.body,
              referenceId: input.referenceId,
              referenceType: input.referenceType,
              idempotencyKey: `${input.idempotencyKey || this.eventKey(input, 'EXTERNAL')}:${destination.toLowerCase()}`,
              recipients: { create: [{ ...recipient, status: 'PENDING' }] },
              logs: {
                create: [
                  {
                    recipient: destination,
                    status: 'PENDING',
                    message: 'Queued for provider delivery',
                  },
                ],
              },
            },
          });
        });
      } catch (error) {
        if ((error as Prisma.PrismaClientKnownRequestError)?.code !== 'P2002') this.logError(error);
      }
    }
  }

  async enqueueLowStock(input: {
    businessId: string;
    productId: string;
    locationId: string;
    quantity: number;
    threshold: number;
    productName: string;
    locationName: string;
  }) {
    const day = new Date().toISOString().slice(0, 10);
    await this.publishEvent({
      businessId: input.businessId,
      eventType: NotificationEventType.LOW_STOCK,
      referenceId: input.productId,
      referenceType: 'Product',
      idempotencyKey: `LOW_STOCK:${input.productId}:${input.locationId}:${day}`,
      variables: input,
      subject: `Low stock: ${input.productName}`,
      body: `${input.productName} has ${input.quantity} units at ${input.locationName}; reorder threshold is ${input.threshold}.`,
    });
  }

  async checkStockLevel(businessId: string, productId: string, locationId: string) {
    try {
      const [product, balance, location] = await Promise.all([
        this.prisma.product.findFirst({
          where: { id: productId, businessId, status: 'ACTIVE' },
          select: { name: true, minimumStock: true, reorderLevel: true },
        }),
        this.prisma.stockBalance.findFirst({
          where: { productId, locationId, location: { businessId, isActive: true } },
          select: { quantity: true },
        }),
        this.prisma.location.findFirst({
          where: { id: locationId, businessId, isActive: true },
          select: { name: true },
        }),
      ]);
      if (!product || !location) return;
      const quantity = balance?.quantity ?? 0;
      const threshold = Math.max(product.minimumStock, product.reorderLevel);
      if (quantity <= threshold) {
        await this.enqueueLowStock({
          businessId,
          productId,
          locationId,
          quantity,
          threshold,
          productName: product.name,
          locationName: location.name,
        });
      }
    } catch (error) {
      this.logError(error);
    }
  }

  async runScheduledScans() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      await Promise.all([this.scanLowStock(), this.scanPaymentDue()]);
    } finally {
      this.scanning = false;
    }
  }

  async drainPending(limit = 20) {
    if (this.draining) return 0;
    this.draining = true;
    try {
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
      await this.prisma.notification.updateMany({
        where: {
          type: { in: [NotificationType.EMAIL, NotificationType.SMS] },
          status: 'SENDING',
          lastAttemptAt: { lte: staleBefore },
        },
        data: { status: 'FAILED', nextRetryAt: new Date() },
      });
      const due = await this.prisma.notification.findMany({
        where: {
          type: { in: [NotificationType.EMAIL, NotificationType.SMS] },
          status: { in: ['PENDING', 'FAILED', 'PARTIALLY_SENT'] },
          attemptCount: { lt: MAX_ATTEMPTS },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        select: { id: true, businessId: true },
        orderBy: { createdAt: 'asc' },
        take: Math.min(Math.max(limit, 1), 100),
      });
      let claimed = 0;
      for (const row of due) if (await this.deliver(row.id, row.businessId)) claimed++;
      return claimed;
    } finally {
      this.draining = false;
    }
  }

  async processNow(businessId: string, limit = 20) {
    const ids = await this.prisma.notification.findMany({
      where: {
        businessId,
        type: { in: [NotificationType.EMAIL, NotificationType.SMS] },
        status: { in: ['PENDING', 'FAILED', 'PARTIALLY_SENT'] },
        attemptCount: { lt: MAX_ATTEMPTS },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let processed = 0;
    for (const item of ids) if (await this.deliver(item.id, businessId)) processed++;
    return { processed, selected: ids.length };
  }

  private async resolveMessage(businessId: string, dto: CreateNotificationDto) {
    let subject = dto.subject?.trim() || '';
    let body = dto.body || '';
    if (dto.templateId) {
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { id: dto.templateId, businessId, isActive: true },
      });
      if (!template) throw new NotFoundException('Active notification template not found');
      if (template.type !== dto.type || template.eventType !== dto.eventType) {
        throw new BadRequestException(
          'Template channel and event type must match the notification',
        );
      }
      subject = template.subject;
      body = template.body;
      for (const variable of template.variables) {
        if (dto.variables?.[variable] === undefined)
          throw new BadRequestException(`Missing template variable: ${variable}`);
      }
    }
    if (!subject || !body)
      throw new BadRequestException('Provide a template or both subject and body');
    const variables = dto.variables || {};
    const render = (text: string) =>
      text.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key: string) => {
        const value = key
          .split('.')
          .reduce<unknown>(
            (acc, part) =>
              acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
            variables,
          );
        if (value === undefined || value === null)
          throw new BadRequestException(`Missing template variable: ${key}`);
        return this.escapeHtml(String(value));
      });
    return { subject: render(subject), body: render(body) };
  }

  private async eventMessage(
    businessId: string,
    eventType: NotificationEventType,
    type: NotificationType,
    variables: Record<string, unknown>,
    fallbackSubject: string,
    fallbackBody: string,
  ) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { businessId, eventType, type, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!template) return { subject: fallbackSubject, body: fallbackBody };
    for (const key of template.variables) {
      if (variables[key] === undefined || variables[key] === null) {
        throw new BadRequestException(`Missing event template variable: ${key}`);
      }
    }
    const render = (value: string) =>
      value.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key: string) => {
        const resolved = key
          .split('.')
          .reduce<unknown>(
            (current, part) =>
              current && typeof current === 'object'
                ? (current as Record<string, unknown>)[part]
                : undefined,
            variables,
          );
        if (resolved === undefined || resolved === null)
          throw new BadRequestException(`Missing event template variable: ${key}`);
        return this.escapeHtml(String(resolved));
      });
    return { subject: render(template.subject), body: render(template.body) };
  }

  private validateRecipients(type: NotificationType, recipients: NotificationRecipientDto[]) {
    if (!recipients.length)
      throw new BadRequestException('At least one notification recipient is required');
    const seen = new Set<string>();
    for (const recipient of recipients) {
      const target =
        type === NotificationType.EMAIL
          ? recipient.email?.trim().toLowerCase()
          : type === NotificationType.SMS
            ? recipient.phoneNumber?.trim()
            : recipient.userId;
      if (!target)
        throw new BadRequestException(
          `${type} recipients require ${type === NotificationType.EMAIL ? 'email' : type === NotificationType.SMS ? 'phoneNumber' : 'userId'}`,
        );
      if (type === NotificationType.IN_APP && !recipient.userId)
        throw new BadRequestException('In-app recipients must be users');
      if (seen.has(target))
        throw new BadRequestException('Duplicate notification recipients are not allowed');
      seen.add(target);
    }
  }

  private async assertBusinessUsers(businessId: string, userIds: string[]) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, businessId, isActive: true },
      select: { id: true },
    });
    if (new Set(users.map((user) => user.id)).size !== new Set(userIds).size) {
      throw new NotFoundException('One or more active recipients were not found in this business');
    }
  }

  private async findEventUsers(businessId: string, eventType: NotificationEventType) {
    const permission = INTERNAL_PERMISSION[eventType];
    return this.prisma.user.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { permissions: { some: { key: permission } } },
          { userRoles: { some: { role: { permissions: { some: { key: permission } } } } } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  private userName(user: { firstName: string; lastName: string; email: string }) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  }

  private defaultEventMessage(
    eventType: NotificationEventType,
    variables: Record<string, unknown>,
  ) {
    const eventLabel = String(eventType).replace(/_/g, ' ');
    const label = String(
      variables.invoiceNumber ||
        variables.paymentNumber ||
        variables.poNumber ||
        variables.expenseNumber ||
        variables.reportName ||
        eventLabel,
    );
    switch (eventType) {
      case NotificationEventType.PAYMENT_RECEIVED:
        return {
          subject: `Payment received: ${label}`,
          body: `We received ${variables.amount ?? ''} for invoice ${variables.invoiceNumber || 'your account'}. Thank you.`,
        };
      case NotificationEventType.INVOICE_CREATED:
      case NotificationEventType.SALES_INVOICE_ISSUED:
        return {
          subject: `Invoice ${label}`,
          body: `Invoice ${label} for ${variables.totalAmount ?? ''} has been created or issued.`,
        };
      case NotificationEventType.PAYMENT_DUE:
        return {
          subject: `Payment overdue: ${label}`,
          body: `Invoice ${label} is overdue by ${variables.daysOverdue ?? 0} days. Balance: ${variables.balance ?? ''} ${variables.currency ?? ''}.`,
        };
      case NotificationEventType.LOW_STOCK:
        return {
          subject: `Low stock: ${variables.productName || label}`,
          body: `${variables.productName || label} has ${variables.quantity ?? 0} units at ${variables.locationName || 'the location'}; reorder threshold is ${variables.threshold ?? ''}.`,
        };
      case NotificationEventType.PURCHASE_ORDER_APPROVED: {
        const supplierName = this.escapeHtml(String(variables.supplierName || 'supplier'));
        const currency = this.escapeHtml(String(variables.currency || ''));
        const amount = Number(variables.totalAmount);
        const formattedAmount = Number.isFinite(amount)
          ? new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(amount)
          : this.escapeHtml(String(variables.totalAmount ?? ''));
        const safeLabel = this.escapeHtml(label);
        return {
          subject: `Purchase order approved: ${safeLabel}`,
          body: `Purchase order ${safeLabel} for ${supplierName}, totaling ${currency} ${formattedAmount}, has been approved.`,
        };
      }
      case NotificationEventType.EXPENSE_APPROVED:
        return {
          subject: `Expense approved: ${label}`,
          body: `Expense ${label} for ${variables.amount ?? ''} has been approved.`,
        };
      case NotificationEventType.REPORT_GENERATED:
        return {
          subject: `Report generated: ${label}`,
          body: `${label} was generated in ${variables.format || 'an available format'}.`,
        };
      default:
        return {
          subject: `${eventLabel}: ${label}`,
          body: `${eventLabel} — ${label}`,
        };
    }
  }

  private eventKey(input: EventInput, channel: string) {
    return `${input.eventType}:${input.referenceType || 'event'}:${
      input.referenceId ||
      createHash('sha256')
        .update(JSON.stringify(input.variables || {}))
        .digest('hex')
    }:${channel}`;
  }

  private async scanLowStock() {
    const pageSize = 500;
    let skip = 0;
    while (true) {
      const lowStocks = await this.prisma.$queryRaw<
        Array<{
          businessId: string;
          productId: string;
          productName: string;
          locationId: string;
          locationName: string;
          quantity: number;
          threshold: number;
        }>
      >`
        SELECT p."businessId", p."id" AS "productId", p."name" AS "productName",
               l."id" AS "locationId", l."name" AS "locationName",
               COALESCE(s."quantity", 0)::double precision AS "quantity",
               GREATEST(p."reorderLevel", p."minimumStock")::double precision AS "threshold"
        FROM "Product" p
        JOIN "Business" b ON b."id" = p."businessId" AND b."isActive" = true
        JOIN "Location" l ON l."businessId" = p."businessId" AND l."isActive" = true
        LEFT JOIN "StockBalance" s ON s."productId" = p."id" AND s."locationId" = l."id"
        WHERE p."status" = 'ACTIVE'
          AND COALESCE(s."quantity", 0) <= GREATEST(p."reorderLevel", p."minimumStock")
        ORDER BY p."businessId", p."id", l."id"
        LIMIT ${pageSize} OFFSET ${skip}
      `;
      for (const row of lowStocks) {
        await this.enqueueLowStock(row);
      }
      if (lowStocks.length < pageSize) break;
      skip += lowStocks.length;
    }
  }

  private async scanPaymentDue() {
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const now = new Date();
    const pageSize = 500;
    let skip = 0;
    while (true) {
      const invoices = await this.prisma.salesInvoice.findMany({
        where: {
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
          OR: [{ dueDate: { lte: today } }, { dueDate: null, issuedDate: { lte: today } }],
          balance: { gt: 0 },
          business: { isActive: true },
        },
        include: {
          customer: { select: { email: true, name: true } },
          business: { select: { currency: true } },
        },
        orderBy: { id: 'asc' },
        skip,
        take: pageSize,
      });
      for (const invoice of invoices) {
        const dueDate = invoice.dueDate || invoice.issuedDate;
        if (!dueDate) continue;
        const days = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000));
        const reminderWeek = Math.floor(days / 7);
        const variables = {
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customer.name,
          balance: invoice.balance,
          currency: invoice.business.currency,
          daysOverdue: days,
        };
        await this.publishEvent({
          businessId: invoice.businessId,
          eventType: NotificationEventType.PAYMENT_DUE,
          referenceId: invoice.id,
          referenceType: 'SalesInvoice',
          idempotencyKey: `PAYMENT_DUE:${invoice.id}:W${reminderWeek}`,
          variables,
          subject: `Payment overdue: ${invoice.invoiceNumber}`,
          body: `Invoice ${invoice.invoiceNumber} is ${days} days overdue. Balance due: ${invoice.balance} ${invoice.business.currency}.`,
          externalRecipients: invoice.customer.email
            ? [{ email: invoice.customer.email, name: invoice.customer.name }]
            : [],
        });
      }
      if (invoices.length < pageSize) break;
      skip += invoices.length;
    }
  }

  private async deliver(notificationId: string, businessId: string) {
    const candidate = await this.prisma.notification.findFirst({
      where: { id: notificationId, businessId },
      select: { type: true },
    });
    if (!candidate || !(await this.hasProviderConfig(businessId, candidate.type))) return false;
    const claim = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        businessId,
        type: { in: [NotificationType.EMAIL, NotificationType.SMS] },
        status: { in: ['PENDING', 'FAILED', 'PARTIALLY_SENT'] },
        attemptCount: { lt: MAX_ATTEMPTS },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      data: {
        status: 'SENDING',
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        nextRetryAt: null,
      },
    });
    if (!claim.count) return false;
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, businessId },
      include: { recipients: true },
    });
    if (!notification) return false;
    const pending = notification.recipients.filter((recipient) => recipient.status !== 'SENT');
    for (const recipient of pending) {
      try {
        const providerId =
          notification.type === NotificationType.EMAIL
            ? await this.sendEmail(
                businessId,
                recipient.email,
                recipient.name,
                notification.subject,
                notification.body,
              )
            : await this.sendSms(businessId, recipient.phoneNumber, notification.body);
        await this.prisma.$transaction([
          this.prisma.notificationRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SENT', sentAt: new Date(), failureReason: null, providerId },
          }),
          this.prisma.notificationLog.create({
            data: {
              notificationId,
              recipient: recipient.email || recipient.phoneNumber || '',
              status: 'SENT',
              message: 'Provider accepted the message',
              responseCode: 200,
            },
          }),
        ]);
      } catch (error) {
        const message = this.safeError(error);
        await this.prisma.$transaction([
          this.prisma.notificationRecipient.update({
            where: { id: recipient.id },
            data: { status: 'FAILED', failureReason: message.slice(0, 1000) },
          }),
          this.prisma.notificationLog.create({
            data: {
              notificationId,
              recipient: recipient.email || recipient.phoneNumber || '',
              status: 'FAILED',
              message: message.slice(0, 1000),
            },
          }),
        ]);
      }
    }
    const recipients = await this.prisma.notificationRecipient.findMany({
      where: { notificationId },
      select: { status: true },
    });
    const sent = recipients.filter((recipient) => recipient.status === 'SENT').length;
    const failed = recipients.length - sent;
    const status = failed === 0 ? 'SENT' : sent === 0 ? 'FAILED' : 'PARTIALLY_SENT';
    const attemptCount = notification.attemptCount;
    const nextRetryAt =
      failed && attemptCount < MAX_ATTEMPTS
        ? new Date(Date.now() + Math.min(60, 2 ** attemptCount) * 60_000)
        : null;
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status, sentAt: status === 'SENT' ? new Date() : null, nextRetryAt },
    });
    return true;
  }

  private async hasProviderConfig(businessId: string, type: string) {
    if (type === NotificationType.EMAIL) {
      return Boolean(
        await this.prisma.emailConfig.findUnique({
          where: { businessId },
          select: { businessId: true },
        }),
      );
    }
    if (type === NotificationType.SMS) {
      return Boolean(
        await this.prisma.sMSConfig.findUnique({
          where: { businessId },
          select: { businessId: true },
        }),
      );
    }
    return false;
  }

  private async sendEmail(
    businessId: string,
    to: string | null,
    name: string,
    subject: string,
    html: string,
  ) {
    if (!to) throw new BadRequestException('Recipient email is missing');
    const config = await this.prisma.emailConfig.findUnique({ where: { businessId } });
    if (!config) throw new BadRequestException('Configure an email provider before sending email');
    const secret = this.decrypt<EmailSecret>(config.config);
    if (config.provider === 'SMTP') {
      const transporter = nodemailer.createTransport({
        host: secret.smtpHost,
        port: secret.smtpPort,
        secure: secret.secure,
        auth: { user: secret.smtpUsername, pass: secret.smtpPassword },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 60000,
      });
      let timeout: NodeJS.Timeout | undefined;
      try {
        const sent = await Promise.race([
          transporter.sendMail({
            from: { name: config.fromName, address: config.fromEmail },
            to: { name, address: to },
            subject,
            html,
          }),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              transporter.close();
              reject(new Error('Email provider delivery timed out'));
            }, 60000);
          }),
        ]);
        return sent.messageId;
      } finally {
        if (timeout) clearTimeout(timeout);
        transporter.close();
      }
    }
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name }] }],
        from: { email: config.fromEmail, name: config.fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const responseText = await response.text();
    if (!response.ok)
      throw new Error(
        `SendGrid request failed (${response.status}): ${responseText.slice(0, 300)}`,
      );
    return response.headers.get('x-message-id') || undefined;
  }

  private async sendSms(businessId: string, to: string | null, body: string) {
    if (!to) throw new BadRequestException('Recipient phone number is missing');
    const config = await this.prisma.sMSConfig.findUnique({ where: { businessId } });
    if (!config) throw new BadRequestException('Configure an SMS provider before sending SMS');
    const secret = this.decrypt<SmsSecret>(config.config);
    if (config.provider === 'TWILIO') {
      const auth = Buffer.from(`${secret.accountSid}:${secret.apiKey}`).toString('base64');
      const form = new URLSearchParams({ To: to, From: config.fromNumber, Body: body });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${secret.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form,
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!response.ok)
        throw new Error(
          `Twilio request failed (${response.status}): ${(data.message || 'provider error').slice(0, 300)}`,
        );
      return data.sid;
    }
    const form = new URLSearchParams({
      username: secret.username || '',
      to,
      message: body,
      from: config.fromNumber,
    });
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: secret.apiKey || '',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      SMSMessageData?: {
        Recipients?: Array<{ status?: string; messageId?: string; statusCode?: number }>;
      };
    };
    const recipient = data.SMSMessageData?.Recipients?.[0];
    if (!response.ok || (recipient?.statusCode !== undefined && recipient.statusCode !== 101)) {
      throw new Error(
        `Africa's Talking request failed (${response.status}): ${(recipient?.status || 'provider error').slice(0, 300)}`,
      );
    }
    return recipient?.messageId;
  }

  private encrypt(value: unknown) {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  private decrypt<T>(value: string): T {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext)
      throw new ConflictException('Stored provider configuration has an unsupported format');
    const keys = [this.encryptionKey()];
    if (process.env.NOTIFICATION_CONFIG_ENCRYPTION_KEY_PREVIOUS) {
      keys.push(this.encryptionKey(process.env.NOTIFICATION_CONFIG_ENCRYPTION_KEY_PREVIOUS));
    }
    for (const key of keys) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
        return JSON.parse(plaintext) as T;
      } catch {
        // Try the previous key during a controlled secret rotation.
      }
    }
    throw new ConflictException('Provider configuration cannot be decrypted with the active keys');
  }

  private encryptionKey(secret = process.env.NOTIFICATION_CONFIG_ENCRYPTION_KEY) {
    if (!secret || secret.length < 32)
      throw new ConflictException(
        'Set NOTIFICATION_CONFIG_ENCRYPTION_KEY to at least 32 characters',
      );
    return createHash('sha256').update(secret).digest();
  }

  private escapeHtml(value: string) {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ||
        character,
    );
  }

  private mapUniqueError(error: unknown, message: string) {
    if ((error as Prisma.PrismaClientKnownRequestError)?.code === 'P2002')
      throw new ConflictException(message);
  }

  private safeError(error: unknown) {
    return error instanceof Error ? error.message : 'Notification provider failed';
  }

  private logError(error: unknown) {
    const message = this.safeError(error);
    this.logger.error(message);
    this.appLogger.error(`[NOTIFICATIONS] ${message}`);
  }
}
