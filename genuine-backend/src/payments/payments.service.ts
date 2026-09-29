import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  CloseAccountingPeriodDto,
  CreateAccountingPeriodDto,
  CreateExpenseDto,
  CreatePaymentDto,
  FinancialReportQueryDto,
  PaymentDirection,
  PaymentListQueryDto,
  PaymentReferenceType,
  ReconcilePaymentDto,
  RejectExpenseDto,
  VoidPaymentDto,
} from './dto';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const ACTIVE_PAYMENT_STATUSES = ['RECORDED', 'VERIFIED', 'RECONCILED', 'COMPLETED'];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async createPayment(businessId: string, userId: string, dto: CreatePaymentDto) {
    const amount = roundMoney(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('Amount must be positive');
    if (dto.referenceType === PaymentReferenceType.Other && !dto.direction) {
      throw new BadRequestException('direction is required for Other payments');
    }
    if (dto.referenceType !== PaymentReferenceType.Other && dto.direction) {
      throw new BadRequestException('direction is determined by the payment reference');
    }
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    if (!Number.isFinite(paymentDate.getTime()))
      throw new BadRequestException('Invalid paymentDate');
    let paymentId: string;
    try {
      paymentId = await this.retrySerializationConflict(() =>
        this.prisma.$transaction(
          async (tx) => {
            const method = await tx.paymentMethod.findFirst({
              where: { id: dto.paymentMethodId, businessId, isActive: true },
            });
            if (!method) throw new NotFoundException('Active payment method not found');
            await this.assertPeriodOpen(tx, businessId, paymentDate);

            const duplicateKey = dto.idempotencyKey
              ? createHash('sha256').update(dto.idempotencyKey).digest('hex')
              : null;
            if (duplicateKey) {
              const existing = await tx.payment.findFirst({
                where: { businessId, idempotencyKey: duplicateKey },
              });
              if (existing) {
                const same =
                  existing.referenceType === dto.referenceType &&
                  existing.referenceId === dto.referenceId &&
                  existing.amount === amount &&
                  existing.paymentMethodId === dto.paymentMethodId;
                if (!same)
                  throw new ConflictException(
                    'Idempotency key was already used for a different payment',
                  );
                return existing.id;
              }
            }

            const reference = await this.resolvePaymentReference(
              tx,
              businessId,
              dto.referenceType,
              dto.referenceId,
              paymentDate,
            );
            if (dto.referenceType === PaymentReferenceType.Other && !dto.referenceId.trim()) {
              throw new BadRequestException('referenceId is required for Other payments');
            }
            if (reference.balance !== null && amount > reference.balance + 0.000001) {
              throw new BadRequestException(
                `Payment exceeds the balance due (${reference.balance})`,
              );
            }
            const paymentNumber =
              dto.paymentNumber?.trim() ||
              (await this.nextPaymentNumber(tx, businessId, paymentDate));
            const payment = await tx.payment.create({
              data: {
                businessId,
                paymentNumber,
                paymentDate,
                referenceType: dto.referenceType,
                referenceId: dto.referenceId,
                direction:
                  dto.referenceType === PaymentReferenceType.Other
                    ? dto.direction
                    : dto.referenceType === PaymentReferenceType.SalesInvoice
                      ? PaymentDirection.INFLOW
                      : PaymentDirection.OUTFLOW,
                referenceNumber: dto.referenceNumber || reference.number || null,
                invoiceId: reference.invoiceId,
                poId: reference.poId,
                expenseId: reference.expenseId,
                customerId: reference.customerId,
                supplierId: reference.supplierId,
                amount,
                paymentMethodId: method.id,
                reference: dto.referenceNumber,
                bankName: dto.bankName,
                accountNumber: dto.accountNumber,
                chequeNumber: dto.chequeNumber,
                transactionId: dto.transactionId,
                notes: dto.notes,
                idempotencyKey: duplicateKey,
                status: 'RECORDED',
                createdBy: userId,
                processedAt: new Date(),
              },
            });
            await this.refreshReferencePaymentState(tx, reference, businessId, userId, payment);
            await this.audit(
              tx,
              businessId,
              userId,
              'Payment',
              payment.id,
              'CREATE',
              null,
              payment,
            );
            return payment.id;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      this.mapWriteError(
        error,
        'Payment could not be recorded because the balance or payment number changed',
      );
    }
    return this.getPaymentById(businessId, paymentId!);
  }

  private async resolvePaymentReference(
    tx: Prisma.TransactionClient,
    businessId: string,
    type: PaymentReferenceType,
    id: string,
    at: Date,
  ) {
    if (type === PaymentReferenceType.SalesInvoice) {
      await tx.$queryRaw`SELECT "id" FROM "SalesInvoice" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const invoice = await tx.salesInvoice.findFirst({ where: { id, businessId } });
      if (!invoice) throw new NotFoundException('Sales invoice not found');
      if (!invoice.issuedDate || ['DRAFT', 'CANCELLED'].includes(invoice.status))
        throw new BadRequestException('Payment requires an issued invoice');
      const [paid, returns] = await Promise.all([
        tx.payment.aggregate({
          where: { businessId, invoiceId: id, status: { in: ACTIVE_PAYMENT_STATUSES } },
          _sum: { amount: true },
        }),
        tx.salesReturn.aggregate({
          where: {
            businessId,
            invoiceId: id,
            status: { in: ['RECEIVED', 'COMPLETED'] },
            returnDate: { lte: at },
          },
          _sum: { totalAmount: true },
        }),
      ]);
      const balance = roundMoney(
        invoice.totalAmount - (paid._sum.amount || 0) - (returns._sum.totalAmount || 0),
      );
      if (balance <= 0) throw new BadRequestException('Invoice has no amount due');
      return {
        invoiceId: id,
        customerId: invoice.customerId,
        number: invoice.invoiceNumber,
        balance,
        invoice,
      };
    }
    if (type === PaymentReferenceType.PurchaseOrder) {
      await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const po = await tx.purchaseOrder.findFirst({ where: { id, businessId } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (['DRAFT', 'CANCELLED'].includes(po.status))
        throw new BadRequestException('Payment requires an approved purchase order');
      const paid = await tx.payment.aggregate({
        where: { businessId, poId: id, status: { in: ACTIVE_PAYMENT_STATUSES } },
        _sum: { amount: true },
      });
      const balance = roundMoney(po.totalAmount - (paid._sum.amount || 0));
      if (balance <= 0) throw new BadRequestException('Purchase order has no amount due');
      return { poId: id, supplierId: po.supplierId, number: po.poNumber, balance, po };
    }
    if (type === PaymentReferenceType.Expense) {
      await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const expense = await tx.expense.findFirst({ where: { id, businessId } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (expense.status !== 'APPROVED' && expense.status !== 'PAID')
        throw new BadRequestException('Only approved expenses can be paid');
      const paid = await tx.payment.aggregate({
        where: { businessId, expenseId: id, status: { in: ACTIVE_PAYMENT_STATUSES } },
        _sum: { amount: true },
      });
      const balance = roundMoney(expense.amount - (paid._sum.amount || 0));
      if (balance <= 0) throw new BadRequestException('Expense has no amount due');
      return { expenseId: id, number: expense.expenseNumber, balance, expense };
    }
    return { balance: null };
  }

  private async refreshReferencePaymentState(
    tx: Prisma.TransactionClient,
    ref: any,
    businessId: string,
    userId: string,
    payment: any,
  ) {
    if (ref.invoiceId) {
      const paid = await tx.payment.aggregate({
        where: { businessId, invoiceId: ref.invoiceId, status: { in: ACTIVE_PAYMENT_STATUSES } },
        _sum: { amount: true },
      });
      const returned = await tx.salesReturn.aggregate({
        where: { businessId, invoiceId: ref.invoiceId, status: { in: ['RECEIVED', 'COMPLETED'] } },
        _sum: { totalAmount: true },
      });
      const totalPaid = roundMoney(paid._sum.amount || 0);
      const invoice = ref.invoice;
      const balance = roundMoney(
        invoice.totalAmount - totalPaid - (returned._sum.totalAmount || 0),
      );
      await tx.salesInvoice.update({
        where: { id: ref.invoiceId },
        data: {
          totalPaid,
          balance,
          status: balance <= 0 ? 'PAID' : totalPaid > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
        },
      });
    } else if (ref.poId) {
      // Payables are derived from non-voided Payment rows; do not overwrite PO lifecycle state.
    } else if (ref.expenseId) {
      const paid = await tx.payment.aggregate({
        where: { businessId, expenseId: ref.expenseId, status: { in: ACTIVE_PAYMENT_STATUSES } },
        _sum: { amount: true },
      });
      const totalPaid = roundMoney(paid._sum.amount || 0);
      const isPaid = totalPaid >= ref.expense.amount - 0.000001;
      await tx.expense.update({
        where: { id: ref.expenseId },
        data: {
          isPaid,
          status: isPaid ? 'PAID' : 'APPROVED',
          ...(isPaid
            ? { paidBy: userId, paidAt: new Date(), paymentMethodId: payment.paymentMethodId }
            : {}),
        },
      });
    }
  }

  async getPaymentById(businessId: string, id: string) {
    const row = await this.prisma.payment.findFirst({
      where: { id, businessId },
      include: { paymentMethod: true },
    });
    if (!row) throw new NotFoundException('Payment not found');
    return {
      ...row,
      paymentMethodName: row.paymentMethod.name,
      processedBy: row.createdBy,
      reconciledBy: row.reconciledBy || undefined,
    };
  }

  async getAllPayments(businessId: string, query: PaymentListQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: Prisma.PaymentWhereInput = {
      businessId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.referenceType ? { referenceType: query.referenceType } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: { paymentMethod: true },
        orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data: data.map((row) => ({ ...row, paymentMethodName: row.paymentMethod.name })),
      total,
      page,
      limit,
    };
  }

  async reconcilePayment(businessId: string, userId: string, id: string, dto: ReconcilePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id, businessId } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === 'VOIDED')
        throw new ConflictException('Voided payments cannot be reconciled');
      if (payment.isReconciled) throw new ConflictException('Payment is already reconciled');
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: 'RECONCILED',
          isReconciled: true,
          reconciledBy: userId,
          reconciledAt: new Date(),
          bankStatementReference: dto.bankStatementReference,
        },
      });
      await this.audit(tx, businessId, userId, 'Payment', id, 'RECONCILE', payment, updated);
      return updated;
    });
  }

  async voidPayment(businessId: string, userId: string, id: string, dto: VoidPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id, businessId } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === 'VOIDED') throw new ConflictException('Payment is already voided');
      if (payment.isReconciled)
        throw new ConflictException(
          'Reconciled payments require a reversal entry and cannot be voided',
        );
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: dto.reason,
          isReconciled: false,
        },
      });
      if (payment.invoiceId) {
        const invoice = await tx.salesInvoice.findFirst({
          where: { id: payment.invoiceId, businessId },
        });
        if (invoice) await this.recomputeInvoice(tx, businessId, invoice.id);
      }
      if (payment.poId) {
        // Payables are derived from non-voided Payment rows; PO status is a receiving workflow.
      }
      if (payment.expenseId) {
        const expense = await tx.expense.findFirst({
          where: { id: payment.expenseId, businessId },
        });
        if (expense) {
          const paid = await tx.payment.aggregate({
            where: { businessId, expenseId: expense.id, status: { in: ACTIVE_PAYMENT_STATUSES } },
            _sum: { amount: true },
          });
          const isPaid = (paid._sum.amount || 0) >= expense.amount - 0.000001;
          await tx.expense.update({
            where: { id: expense.id },
            data: {
              isPaid,
              status: isPaid ? 'PAID' : 'APPROVED',
              ...(isPaid
                ? {}
                : {
                    paidBy: null,
                    paidAt: null,
                    paymentMethodId: null,
                    paymentReference: null,
                  }),
            },
          });
        }
      }
      await this.audit(tx, businessId, userId, 'Payment', id, 'VOID', payment, updated);
      return updated;
    });
  }

  private async recomputeInvoice(
    tx: Prisma.TransactionClient,
    businessId: string,
    invoiceId: string,
  ) {
    const invoice = await tx.salesInvoice.findFirst({ where: { id: invoiceId, businessId } });
    if (!invoice || ['DRAFT', 'CANCELLED'].includes(invoice.status)) return;
    const [payments, returns] = await Promise.all([
      tx.payment.aggregate({
        where: { businessId, invoiceId, status: { in: ACTIVE_PAYMENT_STATUSES } },
        _sum: { amount: true },
      }),
      tx.salesReturn.aggregate({
        where: { businessId, invoiceId, status: { in: ['RECEIVED', 'COMPLETED'] } },
        _sum: { totalAmount: true },
      }),
    ]);
    const paid = roundMoney(payments._sum.amount || 0);
    const balance = roundMoney(invoice.totalAmount - paid - (returns._sum.totalAmount || 0));
    await tx.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        totalPaid: paid,
        balance,
        status: balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
      },
    });
  }

  async createExpense(businessId: string, userId: string, dto: CreateExpenseDto) {
    if (dto.isPaid)
      throw new BadRequestException(
        'Expenses must be approved and paid through the expense workflow',
      );
    const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();
    if (!Number.isFinite(expenseDate.getTime()))
      throw new BadRequestException('Invalid expenseDate');
    const amount = roundMoney(dto.items.reduce((sum, item) => sum + Number(item.amount), 0));
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('Expense total must be positive');
    const id = await this.prisma
      .$transaction(async (tx) => {
        const location = await tx.location.findFirst({
          where: { id: dto.locationId, businessId, isActive: true },
        });
        if (!location) throw new NotFoundException('Active location not found');
        const method = await tx.paymentMethod.findFirst({
          where: { id: dto.paymentMethodId, businessId, isActive: true },
        });
        if (!method) throw new NotFoundException('Active payment method not found');
        const categoryIds = [...new Set(dto.items.map((item) => item.expenseCategoryId))];
        const categories = await tx.expenseCategory.findMany({
          where: { businessId, isActive: true, id: { in: categoryIds } },
        });
        if (categories.length !== categoryIds.length)
          throw new NotFoundException(
            'One or more active expense categories were not found in this business',
          );
        await this.assertPeriodOpen(tx, businessId, expenseDate);
        const expenseNumber =
          dto.expenseNumber?.trim() || (await this.nextExpenseNumber(tx, businessId, expenseDate));
        const rows = await tx.expense.create({
          data: {
            businessId,
            expenseNumber,
            expenseDate,
            categoryId: dto.items[0].expenseCategoryId,
            amount,
            description:
              dto.notes ||
              dto.items
                .map((item) => item.description)
                .filter(Boolean)
                .join('; ') ||
              'Business expense',
            paymentMethodId: method.id,
            locationId: location.id,
            status: 'DRAFT',
            isPaid: false,
            createdBy: userId,
            attachmentUrl: dto.referenceNumber,
            items: {
              create: dto.items.map((item) => ({
                categoryId: item.expenseCategoryId,
                amount: roundMoney(Number(item.amount)),
                description: item.description,
                notes: item.notes,
              })),
            },
          },
          select: { id: true },
        });
        await this.audit(tx, businessId, userId, 'Expense', rows.id, 'CREATE', null, {
          expenseNumber,
          amount,
          items: dto.items,
        });
        return rows.id;
      })
      .catch((error) =>
        this.mapWriteError(
          error,
          'Expense could not be created because its number is already in use',
        ),
      );
    return this.getExpenseById(businessId, id);
  }

  async getExpenseById(businessId: string, id: string) {
    const row = await this.prisma.expense.findFirst({
      where: { id, businessId },
      include: {
        location: true,
        category: true,
        paymentMethod: true,
        items: { include: { category: true } },
      },
    });
    if (!row) throw new NotFoundException('Expense not found');
    return {
      ...row,
      totalAmount: row.amount,
      locationName: row.location?.name,
      paymentMethodName: row.paymentMethod?.name,
      items: row.items.map((item) => ({ ...item, categoryName: item.category.name })),
    };
  }

  async listExpenses(businessId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where: { businessId },
        include: { location: true, category: true, items: { include: { category: true } } },
        orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where: { businessId } }),
    ]);
    return { data, total, page, limit };
  }

  async approveExpense(businessId: string, userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const row = await tx.expense.findFirst({ where: { id, businessId } });
      if (!row) throw new NotFoundException('Expense not found');
      if (row.status !== 'DRAFT')
        throw new ConflictException('Only draft expenses can be approved');
      await this.assertPeriodOpen(tx, businessId, row.expenseDate);
      const updated = await tx.expense.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedAt: new Date(),
          rejectionReason: null,
        },
      });
      await this.audit(tx, businessId, userId, 'Expense', id, 'APPROVE', row, updated);
      return updated;
    });
  }

  async rejectExpense(businessId: string, userId: string, id: string, dto: RejectExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.expense.findFirst({ where: { id, businessId } });
      if (!row) throw new NotFoundException('Expense not found');
      if (row.status !== 'DRAFT')
        throw new ConflictException('Only draft expenses can be rejected');
      const updated = await tx.expense.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: dto.reason,
          approvedBy: userId,
          approvedAt: new Date(),
        },
      });
      await this.audit(tx, businessId, userId, 'Expense', id, 'REJECT', row, updated);
      return updated;
    });
  }

  async payExpense(
    businessId: string,
    userId: string,
    id: string,
    dto?: import('./dto').PayExpenseDto,
  ) {
    const paymentId = await this.retrySerializationConflict(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
          const expense = await tx.expense.findFirst({ where: { id, businessId } });
          if (!expense) throw new NotFoundException('Expense not found');
          if (!['APPROVED', 'PAID'].includes(expense.status))
            throw new ConflictException('Only approved expenses can be paid');
          await this.assertPeriodOpen(tx, businessId, new Date());
          const paymentMethodId = dto?.paymentMethodId || expense.paymentMethodId;
          const method = paymentMethodId
            ? await tx.paymentMethod.findFirst({
                where: { id: paymentMethodId, businessId, isActive: true },
              })
            : null;
          if (!method) throw new NotFoundException('Active payment method not found');
          const paid = await tx.payment.aggregate({
            where: { businessId, expenseId: id, status: { in: ACTIVE_PAYMENT_STATUSES } },
            _sum: { amount: true },
          });
          const remaining = roundMoney(expense.amount - (paid._sum.amount || 0));
          if (remaining <= 0) throw new ConflictException('Expense is already fully paid');
          const paymentNumber = await this.nextPaymentNumber(tx, businessId, new Date());
          const payment = await tx.payment.create({
            data: {
              businessId,
              paymentNumber,
              paymentDate: new Date(),
              referenceType: 'Expense',
              referenceId: id,
              direction: 'OUTFLOW',
              expenseId: id,
              amount: remaining,
              paymentMethodId: method.id,
              status: 'RECORDED',
              createdBy: userId,
              processedAt: new Date(),
              transactionId: dto?.transactionReference,
              notes: dto?.notes,
            },
          });
          const updated = await tx.expense.update({
            where: { id },
            data: {
              status: 'PAID',
              isPaid: true,
              paidBy: userId,
              paidAt: new Date(),
              paymentMethodId: method.id,
              paymentReference: dto?.transactionReference ?? null,
            },
          });
          await this.audit(tx, businessId, userId, 'Expense', id, 'PAY', expense, updated);
          await this.audit(tx, businessId, userId, 'Payment', payment.id, 'CREATE', null, payment);
          return payment.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    return this.getPaymentById(businessId, paymentId);
  }

  async createAccountingPeriod(businessId: string, userId: string, dto: CreateAccountingPeriodDto) {
    const periodName = dto.periodName?.trim();
    if (!periodName) throw new BadRequestException('periodName cannot be empty');
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      startDate >= endDate
    )
      throw new BadRequestException('startDate must be before endDate');
    return this.prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`period:${businessId}`}, 0)) IS NULL AS locked`;
          const overlap = await tx.accountingPeriod.findFirst({
            where: { businessId, startDate: { lte: endDate }, endDate: { gte: startDate } },
          });
          if (overlap) throw new ConflictException(`Accounting period overlaps ${overlap.period}`);
          const period = await tx.accountingPeriod.create({
            data: { businessId, period: periodName, startDate, endDate, status: 'OPEN' },
          });
          await this.audit(
            tx,
            businessId,
            userId,
            'AccountingPeriod',
            period.id,
            'CREATE',
            null,
            period,
          );
          return period;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error) =>
        this.mapWriteError(
          error,
          'Accounting period could not be created because its name or date range changed',
        ),
      );
  }

  async getAccountingPeriodById(businessId: string, id: string) {
    const period = await this.prisma.accountingPeriod.findFirst({ where: { id, businessId } });
    if (!period) throw new NotFoundException('Accounting period not found');
    return { ...period, periodName: period.period };
  }

  async listAccountingPeriods(businessId: string) {
    return (
      await this.prisma.accountingPeriod.findMany({
        where: { businessId },
        orderBy: { startDate: 'desc' },
      })
    ).map((p) => ({ ...p, periodName: p.period }));
  }

  async lockAccountingPeriod(businessId: string, userId: string, id: string) {
    return this.periodTransition(businessId, userId, id, 'LOCK');
  }

  async closeAccountingPeriod(
    businessId: string,
    userId: string,
    id: string,
    dto: CloseAccountingPeriodDto,
  ) {
    return this.periodTransition(businessId, userId, id, 'CLOSE', dto.closingNotes?.trim() || null);
  }

  private async periodTransition(
    businessId: string,
    userId: string,
    id: string,
    action: 'LOCK' | 'CLOSE',
    closingNotes?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.accountingPeriod.findFirst({ where: { id, businessId } });
      if (!row) throw new NotFoundException('Accounting period not found');
      if (action === 'LOCK' && row.status !== 'OPEN')
        throw new ConflictException('Only open periods can be locked');
      if (action === 'CLOSE' && !['OPEN', 'LOCKED'].includes(row.status))
        throw new ConflictException('Accounting period is already closed');
      const updated = await tx.accountingPeriod.update({
        where: { id },
        data:
          action === 'LOCK'
            ? { status: 'LOCKED', lockedBy: userId, lockedAt: new Date() }
            : {
                status: 'CLOSED',
                closedBy: userId,
                closedAt: new Date(),
                closingNotes: closingNotes ?? undefined,
              },
      });
      await this.audit(tx, businessId, userId, 'AccountingPeriod', id, action, row, updated);
      return { ...updated, periodName: updated.period };
    });
  }

  private async assertPeriodOpen(tx: Prisma.TransactionClient, businessId: string, date: Date) {
    const period = await tx.accountingPeriod.findFirst({
      where: {
        businessId,
        startDate: { lte: date },
        endDate: { gte: date },
        status: { in: ['LOCKED', 'CLOSED'] },
      },
    });
    if (period)
      throw new ConflictException(
        `Transactions are blocked for ${period.status.toLowerCase()} period ${period.period}`,
      );
  }

  private async reportRange(businessId: string, filter: FinancialReportQueryDto) {
    if (filter.periodId && (filter.dateFrom || filter.dateTo))
      throw new BadRequestException('Use periodId or dateFrom/dateTo, not both');
    if (filter.periodId) {
      const period = await this.prisma.accountingPeriod.findFirst({
        where: { id: filter.periodId, businessId },
      });
      if (!period) throw new NotFoundException('Accounting period not found');
      return { start: period.startDate, end: period.endDate, label: period.period };
    }
    const now = new Date();
    const start = filter.dateFrom
      ? new Date(filter.dateFrom)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = filter.dateTo ? new Date(filter.dateTo) : new Date();
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end)
      throw new BadRequestException('Invalid report date range');
    if (filter.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(filter.dateTo))
      end.setUTCHours(23, 59, 59, 999);
    return {
      start,
      end,
      label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    };
  }

  async getIncomeStatement(businessId: string, filter: FinancialReportQueryDto) {
    const range = await this.reportRange(businessId, filter);
    const [invoices, returns, expenses] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          businessId,
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          issuedDate: { gte: range.start, lte: range.end },
        },
        include: { customer: true },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          status: { in: ['RECEIVED', 'COMPLETED'] },
          returnDate: { gte: range.start, lte: range.end },
        },
      }),
      this.prisma.expense.findMany({
        where: {
          businessId,
          status: { in: ['APPROVED', 'PAID'] },
          expenseDate: { gte: range.start, lte: range.end },
        },
        include: { items: { include: { category: true } }, category: true },
      }),
    ]);
    const revenue = roundMoney(
      invoices.reduce((s, r) => s + r.totalAmount, 0) -
        returns.reduce((s, r) => s + r.totalAmount, 0),
    );
    const costOfGoodsSold = await this.costOfGoodsSold(businessId, range.start, range.end);
    const operatingExpenses = roundMoney(expenses.reduce((s, e) => s + e.amount, 0));
    const grossProfit = roundMoney(revenue - costOfGoodsSold);
    const operatingIncome = roundMoney(grossProfit - operatingExpenses);
    const group = new Map<string, number>();
    for (const expense of expenses) {
      const items = expense.items.length
        ? expense.items
        : [{ amount: expense.amount, category: expense.category }];
      for (const item of items)
        group.set(
          item.category.name,
          roundMoney((group.get(item.category.name) || 0) + item.amount),
        );
    }
    const details = {
      revenues: [
        {
          category: 'Sales',
          subcategory: 'Net sales',
          amount: revenue,
          percentage: revenue ? 100 : 0,
        },
      ],
      expenses: [...group].map(([category, amount]) => ({
        category: 'Operating expense',
        subcategory: category,
        amount,
        percentage: operatingExpenses ? roundMoney((amount / operatingExpenses) * 100) : 0,
      })),
    };
    return {
      period: range.label,
      revenue,
      costOfGoodsSold,
      grossProfit,
      grossMarginPercentage: revenue ? roundMoney((grossProfit / revenue) * 100) : 0,
      operatingExpenses,
      operatingIncome,
      operatingMarginPercentage: revenue ? roundMoney((operatingIncome / revenue) * 100) : 0,
      otherIncomeExpenses: 0,
      netIncome: operatingIncome,
      netMarginPercentage: revenue ? roundMoney((operatingIncome / revenue) * 100) : 0,
      details,
    };
  }

  async getCashFlowReport(businessId: string, filter: FinancialReportQueryDto) {
    const range = await this.reportRange(businessId, filter);
    const payments = await this.prisma.payment.findMany({
      where: {
        businessId,
        status: { in: ACTIVE_PAYMENT_STATUSES },
        paymentDate: { lte: range.end },
      },
      orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
    });
    const direction = (p: (typeof payments)[number]) =>
      p.direction || (p.invoiceId || p.referenceType === 'SalesInvoice' ? 'INFLOW' : 'OUTFLOW');
    const openingBalance = roundMoney(
      payments
        .filter((p) => p.paymentDate < range.start)
        .reduce((s, p) => s + (direction(p) === 'INFLOW' ? p.amount : -p.amount), 0),
    );
    const selected = payments.filter(
      (p) => p.paymentDate >= range.start && p.paymentDate <= range.end,
    );
    const groupBy = filter.groupBy || 'DAILY';
    const keyFor = (date: Date) => {
      const d = new Date(date);
      if (groupBy === 'MONTHLY')
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (groupBy === 'WEEKLY') {
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        return d.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    };
    const grouped = new Map<string, { inflows: number; outflows: number }>();
    for (const payment of selected) {
      const key = keyFor(payment.paymentDate);
      const row = grouped.get(key) || { inflows: 0, outflows: 0 };
      if (direction(payment) === 'INFLOW') row.inflows += payment.amount;
      else row.outflows += payment.amount;
      grouped.set(key, row);
    }
    let running = openingBalance;
    const details = [...grouped]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => {
        const inflows = roundMoney(row.inflows);
        const outflows = roundMoney(row.outflows);
        const netFlow = roundMoney(inflows - outflows);
        running = roundMoney(running + netFlow);
        return { date, category: 'Payments', inflows, outflows, netFlow, runningBalance: running };
      });
    return {
      period: range.label,
      openingBalance,
      totalInflows: roundMoney(
        selected.filter((p) => direction(p) === 'INFLOW').reduce((s, p) => s + p.amount, 0),
      ),
      totalOutflows: roundMoney(
        selected.filter((p) => direction(p) === 'OUTFLOW').reduce((s, p) => s + p.amount, 0),
      ),
      closingBalance: roundMoney(running),
      details,
    };
  }

  async getReceivablesAgeingReport(businessId: string, filter: FinancialReportQueryDto) {
    const asOf = this.parseAsOf(filter.dateAs);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        businessId,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        issuedDate: { lte: asOf },
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
      },
      include: { customer: true },
    });
    const ids = invoices.map((i) => i.id);
    const [payments, returns] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          businessId,
          invoiceId: { in: ids },
          status: { in: ACTIVE_PAYMENT_STATUSES },
          paymentDate: { lte: asOf },
        },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          invoiceId: { in: ids },
          status: { in: ['RECEIVED', 'COMPLETED'] },
          returnDate: { lte: asOf },
        },
      }),
    ]);
    const paid = this.sumBy(payments, (p) => p.invoiceId!);
    const credit = this.sumBy(returns, (r) => r.invoiceId);
    const byCustomer = new Map<string, any>();
    for (const invoice of invoices) {
      const balance = roundMoney(
        invoice.totalAmount - (paid.get(invoice.id) || 0) - (credit.get(invoice.id) || 0),
      );
      if (balance <= 0) continue;
      const due = invoice.dueDate || invoice.issuedDate || invoice.invoiceDate;
      const days = Math.floor(
        (Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) -
          Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())) /
          86400000,
      );
      const item = byCustomer.get(invoice.customerId) || {
        customerId: invoice.customerId,
        customerName: invoice.customer.name,
        customerCode: invoice.customer.customerCode,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        days120Plus: 0,
        total: 0,
      };
      const bucket =
        days <= 0
          ? 'current'
          : days <= 30
            ? 'days30'
            : days <= 60
              ? 'days60'
              : days <= 90
                ? 'days90'
                : 'days120Plus';
      item[bucket] = roundMoney(item[bucket] + balance);
      item.total = roundMoney(item.total + balance);
      byCustomer.set(invoice.customerId, item);
    }
    return this.ageingResult(asOf, [...byCustomer.values()]);
  }

  async getPayablesAgeingReport(businessId: string, filter: FinancialReportQueryDto) {
    const asOf = this.parseAsOf(filter.dateAs);
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        businessId,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        orderDate: { lte: asOf },
        ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      },
      include: { supplier: true },
    });
    const ids = pos.map((p) => p.id);
    const payments = await this.prisma.payment.findMany({
      where: {
        businessId,
        poId: { in: ids },
        status: { in: ACTIVE_PAYMENT_STATUSES },
        paymentDate: { lte: asOf },
      },
    });
    const paid = this.sumBy(payments, (p) => p.poId!);
    const bySupplier = new Map<string, any>();
    for (const po of pos) {
      const balance = roundMoney(po.totalAmount - (paid.get(po.id) || 0));
      if (balance <= 0) continue;
      const terms = Number((po.supplier.paymentTerms || '').match(/\d+/)?.[0] || 0);
      const due = new Date(po.orderDate);
      due.setUTCDate(due.getUTCDate() + terms);
      const days = Math.floor(
        (Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) -
          Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())) /
          86400000,
      );
      const item = bySupplier.get(po.supplierId) || {
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        supplierCode: po.supplier.supplierCode,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        days120Plus: 0,
        total: 0,
      };
      const bucket =
        days <= 0
          ? 'current'
          : days <= 30
            ? 'days30'
            : days <= 60
              ? 'days60'
              : days <= 90
                ? 'days90'
                : 'days120Plus';
      item[bucket] = roundMoney(item[bucket] + balance);
      item.total = roundMoney(item.total + balance);
      bySupplier.set(po.supplierId, item);
    }
    return this.ageingResult(asOf, [...bySupplier.values()]);
  }

  private ageingResult(asOf: Date, items: any[]) {
    const totals = { current: 0, days30: 0, days60: 0, days90: 0, days120Plus: 0 };
    for (const item of items) for (const key of Object.keys(totals)) totals[key] += item[key];
    return {
      asOf,
      items,
      totalCurrent: roundMoney(totals.current),
      totalDays30: roundMoney(totals.days30),
      totalDays60: roundMoney(totals.days60),
      totalDays90: roundMoney(totals.days90),
      totalDays120Plus: roundMoney(totals.days120Plus),
      grandTotal: roundMoney(Object.values(totals).reduce((a, b) => a + b, 0)),
    };
  }

  async getTrialBalanceReport(businessId: string, filter: FinancialReportQueryDto) {
    const requestedPeriod = filter.periodId
      ? await this.prisma.accountingPeriod.findFirst({
          where: { id: filter.periodId, businessId },
        })
      : null;
    if (filter.periodId && !requestedPeriod)
      throw new NotFoundException('Accounting period not found');
    const asOf = requestedPeriod ? requestedPeriod.endDate : this.parseAsOf(filter.dateAs);
    let periodLabel = 'Current';
    if (requestedPeriod) periodLabel = requestedPeriod.period;
    const [invoices, pos, payments, expenses, returns] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { businessId, status: { notIn: ['DRAFT', 'CANCELLED'] }, issuedDate: { lte: asOf } },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { businessId, status: { notIn: ['DRAFT', 'CANCELLED'] }, orderDate: { lte: asOf } },
      }),
      this.prisma.payment.findMany({
        where: { businessId, status: { in: ACTIVE_PAYMENT_STATUSES }, paymentDate: { lte: asOf } },
      }),
      this.prisma.expense.findMany({
        where: { businessId, status: { in: ['APPROVED', 'PAID'] }, expenseDate: { lte: asOf } },
      }),
      this.prisma.salesReturn.findMany({
        where: {
          businessId,
          status: { in: ['RECEIVED', 'COMPLETED'] },
          returnDate: { lte: asOf },
        },
      }),
    ]);
    const invoicePaid = this.sumBy(
      payments.filter((p) => p.invoiceId),
      (p) => p.invoiceId!,
    );
    const poPaid = this.sumBy(
      payments.filter((p) => p.poId),
      (p) => p.poId!,
    );
    const expensePaid = this.sumBy(
      payments.filter((p) => p.expenseId),
      (p) => p.expenseId!,
    );
    const returned = this.sumBy(returns, (ret) => ret.invoiceId);
    const ar = roundMoney(
      invoices.reduce(
        (s, i) =>
          s + Math.max(0, i.totalAmount - (invoicePaid.get(i.id) || 0) - (returned.get(i.id) || 0)),
        0,
      ),
    );
    const ap = roundMoney(
      pos.reduce((s, p) => s + Math.max(0, p.totalAmount - (poPaid.get(p.id) || 0)), 0),
    );
    const cash = roundMoney(
      payments.reduce(
        (s, p) =>
          s +
          ((p.direction || (p.invoiceId ? 'INFLOW' : 'OUTFLOW')) === 'INFLOW'
            ? p.amount
            : -p.amount),
        0,
      ),
    );
    const expensesDue = roundMoney(
      expenses.reduce((s, e) => s + Math.max(0, e.amount - (expensePaid.get(e.id) || 0)), 0),
    );
    const recognizedExpense = roundMoney(expenses.reduce((s, e) => s + e.amount, 0));
    const sales = roundMoney(
      invoices.reduce((s, i) => s + i.totalAmount, 0) -
        returns.reduce((s, ret) => s + ret.totalAmount, 0),
    );
    // This is an operational summary, not a general-ledger trial balance: the application has no chart of accounts/journal entries yet.
    const items = [
      {
        accountName: 'Cash and cash equivalents (net recorded payments)',
        accountType: 'Asset',
        debit: Math.max(0, cash),
        credit: Math.max(0, -cash),
      },
      { accountName: 'Accounts receivable', accountType: 'Asset', debit: ar, credit: 0 },
      { accountName: 'Accounts payable', accountType: 'Liability', debit: 0, credit: ap },
      {
        accountName: 'Approved expense payable',
        accountType: 'Liability',
        debit: 0,
        credit: expensesDue,
      },
      { accountName: 'Sales revenue', accountType: 'Revenue', debit: 0, credit: sales },
      {
        accountName: 'Operating expenses',
        accountType: 'Expense',
        debit: recognizedExpense,
        credit: 0,
      },
    ]
      .filter((item) => item.debit || item.credit)
      .map((item) => ({ ...item, debit: roundMoney(item.debit), credit: roundMoney(item.credit) }));
    const totalDebits = roundMoney(items.reduce((s, item) => s + item.debit, 0));
    const totalCredits = roundMoney(items.reduce((s, item) => s + item.credit, 0));
    return {
      period: periodLabel,
      asOf,
      items,
      totalDebits,
      totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      reportBasis: 'Operational summary; not a double-entry general-ledger trial balance',
    };
  }

  async getFinancialSummary(businessId: string, filter: FinancialReportQueryDto) {
    if (filter.periodId && filter.dateAs)
      throw new BadRequestException('Use periodId or dateAs, not both');
    const period = filter.periodId
      ? await this.prisma.accountingPeriod.findFirst({
          where: { id: filter.periodId, businessId },
        })
      : null;
    if (filter.periodId && !period) throw new NotFoundException('Accounting period not found');
    const asOf = period ? period.endDate : this.parseAsOf(filter.dateAs);
    const [sales, returns, pos, expenses, payments] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { businessId, status: { notIn: ['DRAFT', 'CANCELLED'] }, issuedDate: { lte: asOf } },
      }),
      this.prisma.salesReturn.findMany({
        where: { businessId, status: { in: ['RECEIVED', 'COMPLETED'] }, returnDate: { lte: asOf } },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { businessId, status: { notIn: ['DRAFT', 'CANCELLED'] }, orderDate: { lte: asOf } },
      }),
      this.prisma.expense.findMany({
        where: { businessId, status: { in: ['APPROVED', 'PAID'] }, expenseDate: { lte: asOf } },
      }),
      this.prisma.payment.findMany({
        where: { businessId, status: { in: ACTIVE_PAYMENT_STATUSES }, paymentDate: { lte: asOf } },
      }),
    ]);
    const inventoryValuation = await this.inventory.getStockValuationReport(businessId, {});
    const inflows = roundMoney(
      payments
        .filter((p) => (p.direction || (p.invoiceId ? 'INFLOW' : 'OUTFLOW')) === 'INFLOW')
        .reduce((s, p) => s + p.amount, 0),
    );
    const outflows = roundMoney(
      payments
        .filter((p) => (p.direction || (p.invoiceId ? 'INFLOW' : 'OUTFLOW')) === 'OUTFLOW')
        .reduce((s, p) => s + p.amount, 0),
    );
    const arPaid = this.sumBy(
      payments.filter((p) => p.invoiceId),
      (p) => p.invoiceId!,
    );
    const poPaid = this.sumBy(
      payments.filter((p) => p.poId),
      (p) => p.poId!,
    );
    const returnedByInvoice = this.sumBy(returns, (r) => r.invoiceId);
    const totalSalesAmount = roundMoney(
      sales.reduce((s, i) => s + i.totalAmount, 0) - returns.reduce((s, r) => s + r.totalAmount, 0),
    );
    const totalPurchasesAmount = roundMoney(pos.reduce((s, p) => s + p.totalAmount, 0));
    const totalExpensesAmount = roundMoney(expenses.reduce((s, e) => s + e.amount, 0));
    const costOfGoodsSold = await this.costOfGoodsSold(businessId, new Date(0), asOf);
    const totalReceivables = roundMoney(
      sales.reduce(
        (s, i) =>
          s +
          Math.max(0, i.totalAmount - (arPaid.get(i.id) || 0) - (returnedByInvoice.get(i.id) || 0)),
        0,
      ),
    );
    const totalPayables = roundMoney(
      pos.reduce((s, p) => s + Math.max(0, p.totalAmount - (poPaid.get(p.id) || 0)), 0),
    );
    const totalInventoryValue = roundMoney(inventoryValuation.totalValue);
    const expensePaid = this.sumBy(
      payments.filter((p) => p.expenseId),
      (p) => p.expenseId!,
    );
    const unpaidExpenses = expenses.reduce(
      (s, e) => s + Math.max(0, e.amount - (expensePaid.get(e.id) || 0)),
      0,
    );
    return {
      period: period?.period || 'As of ' + asOf.toISOString().slice(0, 10),
      asOf,
      totalSalesAmount,
      totalSalesTaxAmount: roundMoney(sales.reduce((s, i) => s + i.taxAmount, 0)),
      totalPurchasesAmount,
      totalExpensesAmount,
      totalPayments: inflows,
      totalReceivables,
      totalPayables,
      totalInventoryValue,
      inventoryValueAsOf: new Date(),
      inventoryValuationMethod: inventoryValuation.costingMethod,
      costOfGoodsSold,
      netIncome: roundMoney(totalSalesAmount - costOfGoodsSold - totalExpensesAmount),
      cashOnHand: roundMoney(inflows - outflows),
      netCashFlow: roundMoney(inflows - outflows),
      unpaidExpenses: roundMoney(unpaidExpenses),
    };
  }

  private parseAsOf(input?: string) {
    const date = input ? new Date(input) : new Date();
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Invalid as-of date');
    if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private async costOfGoodsSold(businessId: string, start: Date, end: Date) {
    const [movements, balances, business] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where: { businessId, product: { businessId }, location: { businessId } },
        include: { product: { select: { buyingPrice: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.stockBalance.findMany({
        where: { product: { businessId }, location: { businessId } },
        select: {
          productId: true,
          locationId: true,
          quantity: true,
          product: { select: { buyingPrice: true } },
        },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { costingMethod: true },
      }),
    ]);
    const method = business?.costingMethod || 'WEIGHTED_AVERAGE';
    if (!['FIFO', 'LIFO', 'WEIGHTED_AVERAGE'].includes(method))
      throw new BadRequestException('Unsupported valuation method');
    const balanceByKey = new Map(
      balances.map((balance) => [
        `${balance.productId}:${balance.locationId}`,
        { quantity: balance.quantity, fallback: balance.product.buyingPrice },
      ]),
    );
    const movementsByKey = new Map<string, typeof movements>();
    for (const movement of movements) {
      const key = `${movement.productId}:${movement.locationId}`;
      const rows = movementsByKey.get(key) || [];
      rows.push(movement);
      movementsByKey.set(key, rows);
    }
    let cogs = 0;
    for (const [key, rows] of movementsByKey) {
      const balance = balanceByKey.get(key);
      const fallback = balance?.fallback ?? rows[0]?.product.buyingPrice ?? 0;
      const movementQuantity = rows.reduce((sum, movement) => sum + movement.quantity, 0);
      const openingQuantity = Math.max(0, (balance?.quantity || 0) - movementQuantity);
      const layers: Array<{ quantity: number; unitCost: number }> =
        openingQuantity > 0 ? [{ quantity: openingQuantity, unitCost: fallback }] : [];
      let shortage = 0;
      for (const movement of rows) {
        if (movement.createdAt > end) break;
        if (movement.quantity > 0) {
          const replenished = Math.min(shortage, movement.quantity);
          shortage = Math.max(0, shortage - replenished);
          const added = Math.max(0, movement.quantity - replenished);
          if (added > 0) layers.push({ quantity: added, unitCost: movement.unitCost ?? fallback });
          if (method === 'WEIGHTED_AVERAGE') {
            const quantity = layers.reduce((sum, layer) => sum + layer.quantity, 0);
            const value = layers.reduce((sum, layer) => sum + layer.quantity * layer.unitCost, 0);
            if (quantity > 0) {
              layers.splice(0, layers.length, { quantity, unitCost: value / quantity });
            }
          }
          if (
            movement.createdAt >= start &&
            ['SALE_REVERSAL', 'CUSTOMER_RETURN'].includes(movement.type)
          ) {
            cogs -= movement.quantity * (movement.unitCost ?? fallback);
          }
        } else if (movement.quantity < 0) {
          let remaining = -movement.quantity;
          let consumedValue = 0;
          const indexes = method === 'LIFO' ? [...layers.keys()].reverse() : [...layers.keys()];
          for (const index of indexes) {
            if (remaining <= 1e-8) break;
            const used = Math.min(layers[index].quantity, remaining);
            consumedValue += used * layers[index].unitCost;
            layers[index].quantity -= used;
            remaining -= used;
          }
          for (let index = layers.length - 1; index >= 0; index--)
            if (layers[index].quantity <= 1e-8) layers.splice(index, 1);
          if (remaining > 1e-8) {
            shortage += remaining;
            consumedValue += remaining * fallback;
          }
          if (movement.createdAt >= start && movement.type === 'SALE') {
            cogs +=
              Math.abs(movement.quantity) *
              (movement.unitCost ?? consumedValue / Math.abs(movement.quantity));
          }
        }
      }
    }
    return roundMoney(cogs);
  }

  private sumBy<T>(rows: T[], key: (row: T) => string) {
    const map = new Map<string, number>();
    for (const row of rows)
      map.set(
        key(row),
        (map.get(key(row)) || 0) + Number((row as any).amount ?? (row as any).totalAmount ?? 0),
      );
    return map;
  }

  private async nextPaymentNumber(tx: Prisma.TransactionClient, businessId: string, date: Date) {
    const prefix = `PAY-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}-`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-number:${businessId}:${prefix}`}, 0)) IS NULL AS locked`;
    const last = await tx.payment.findFirst({
      where: { businessId, paymentNumber: { startsWith: prefix } },
      orderBy: { paymentNumber: 'desc' },
      select: { paymentNumber: true },
    });
    const sequence = last ? Number(last.paymentNumber.slice(prefix.length)) + 1 : 1;
    if (sequence > 99999)
      throw new ConflictException('Payment number sequence exhausted for this month');
    return `${prefix}${String(sequence).padStart(5, '0')}`;
  }

  private async nextExpenseNumber(tx: Prisma.TransactionClient, businessId: string, date: Date) {
    const prefix = `EXP-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}-`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`expense-number:${businessId}:${prefix}`}, 0)) IS NULL AS locked`;
    const last = await tx.expense.findFirst({
      where: { businessId, expenseNumber: { startsWith: prefix } },
      orderBy: { expenseNumber: 'desc' },
      select: { expenseNumber: true },
    });
    const sequence = last ? Number(last.expenseNumber.slice(prefix.length)) + 1 : 1;
    if (sequence > 99999)
      throw new ConflictException('Expense number sequence exhausted for this month');
    return `${prefix}${String(sequence).padStart(5, '0')}`;
  }

  private async retrySerializationConflict<T>(
    operation: () => Promise<T>,
    maxAttempts = 5,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const serializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40001')
            : false;
        if (!serializationConflict || attempt >= maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 20));
      }
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    businessId: string,
    userId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: any,
    after: any,
  ) {
    await tx.auditLog.create({
      data: {
        businessId,
        userId,
        entityType,
        entityId,
        action,
        beforeData: before ? JSON.stringify(before) : null,
        afterData: after ? JSON.stringify(after) : null,
        description: `${action} ${entityType}`,
      },
    });
  }

  private mapWriteError(error: any, conflictMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('The supplied number or idempotency key is already in use');
      if (error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40001'))
        throw new ConflictException(conflictMessage);
    }
    throw error;
  }
}
