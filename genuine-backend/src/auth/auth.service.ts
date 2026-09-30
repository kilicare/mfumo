import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  AuthResponseDto,
  PasswordResetRequestDto,
} from './dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private logger: LoggerService,
    private notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto, ipAddress = 'unknown'): Promise<AuthResponseDto> {
    this.logger.log(`[AUTH] Register attempt: ${dto.email}`);
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException(`Email ${dto.email} already registered`);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            id: uuid(),
            name: dto.businessName,
            businessType: dto.businessType,
            currency: 'TZS',
            taxPercentage: 18,
            allowNegativeStock: false,
            costingMethod: 'FIFO',
          },
        });

        const user = await tx.user.create({
          data: {
            id: uuid(),
            email: normalizedEmail,
            passwordHash: hashedPassword,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            businessId: business.id,
            isActive: true,
          },
        });

        const roles = await this._createDefaultRolesAndPermissions(business.id, tx);
        const ownerRole = roles.find((role) => role.name === 'Owner');
        if (!ownerRole) throw new BadRequestException('Could not create the business owner role');

        await tx.userRole.create({ data: { userId: user.id, roleId: ownerRole.id } });
        const userWithDetails = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          include: { userRoles: { include: { role: { include: { permissions: true } } } } },
        });
        const tokens = await this._generateTokens(
          user.id,
          user.email,
          business.id,
          userWithDetails,
        );

        await tx.userSession.create({
          data: {
            id: uuid(),
            userId: user.id,
            refreshTokenHash: await bcrypt.hash(tokens.refreshToken, 10),
            ipAddress,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        return {
          ...tokens,
          user: {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            firstName: user.firstName,
            lastName: user.lastName,
            businessId: business.id,
            businessName: business.name,
            roles: userWithDetails.userRoles.map((userRole) => userRole.role.name),
            permissions: userWithDetails.userRoles
              .flatMap((userRole) => userRole.role.permissions)
              .map((permission) => permission.key),
          },
        };
      });

      this.logger.log(
        `[AUTH] Registration successful: ${result.user.email} (Business: ${result.user.businessId})`,
      );
      return result;
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
        throw new ConflictException(`Email ${dto.email} already registered`);
      }
      throw error;
    }
  }

  async login(dto: LoginDto, ipAddress: string): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    this.logger.log(`[AUTH] Login attempt: ${normalizedEmail}`);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        business: { select: { name: true } },
        userRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`[AUTH] Invalid password for ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Bring older businesses' built-in roles up to date as new permissions ship.
    await this._createDefaultRolesAndPermissions(user.businessId);
    const refreshedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        userRoles: { include: { role: { include: { permissions: true } } } },
      },
    });
    if (refreshedUser) Object.assign(user, refreshedUser);

    const tokens = await this._generateTokens(user.id, user.email, user.businessId, user);

    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.userSession.create({
      data: {
        id: uuid(),
        userId: user.id,
        refreshTokenHash,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    this.logger.log(`[AUTH] Login successful: ${user.email}`);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        businessId: user.businessId,
        businessName: user.business.name,
        roles: user.userRoles.map((ur) => ur.role.name),
        permissions: user.userRoles.flatMap((ur) => ur.role.permissions).map((p) => p.key),
      },
    };
  }

  async refreshToken(
    dto: RefreshTokenDto,
    userId: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    this.logger.log(`[AUTH] Refresh token attempt for user: ${userId}`);

    try {
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      if (payload.sub !== userId || payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid refresh token');
    }

    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: { refreshTokenHash: true },
    });

    if (!sessions.length) {
      throw new UnauthorizedException('Session expired or not found');
    }

    let isTokenValid = false;
    for (const session of sessions) {
      if (await bcrypt.compare(dto.refreshToken, session.refreshTokenHash)) {
        isTokenValid = true;
        break;
      }
    }
    if (!isTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      businessId: user.businessId,
      permissions: user.userRoles.flatMap((ur) => ur.role.permissions).map((p) => p.key),
    });

    this.logger.log(`[AUTH] Token refreshed for user: ${userId}`);

    return {
      accessToken,
      expiresIn: 15 * 60,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<PasswordResetRequestDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    this.logger.log(`[AUTH] Forgot password request: ${normalizedEmail}`);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return {
        message: 'If email exists, password reset link has been sent',
      };
    }

    const resetToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'password-reset',
      },
      {
        secret: this.config.get('JWT_RESET_SECRET'),
        expiresIn: '1h',
      },
    );

    const tokenHash = await bcrypt.hash(resetToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this._sendPasswordResetEmail(user.businessId, user.email, user.firstName, resetToken);

    return {
      message: 'If email exists, password reset link has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    this.logger.log(`[AUTH] Reset password attempt`);

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.token, {
        secret: this.config.get('JWT_RESET_SECRET'),
      });
      if (payload.type !== 'password-reset') {
        throw new UnauthorizedException('Invalid or expired reset token');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isTokenValid = await bcrypt.compare(dto.token, user.passwordResetTokenHash || '');
    if (!isTokenValid) {
      throw new UnauthorizedException('Invalid reset token');
    }

    if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedException('Reset token expired');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordResetTokenHash: user.passwordResetTokenHash,
          passwordResetExpiresAt: { gt: new Date() },
        },
        data: {
          passwordHash: hashedPassword,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired reset token');
      }
      await tx.userSession.deleteMany({ where: { userId: user.id } });
    });

    this.logger.log(`[AUTH] Password reset successful: ${user.email}`);

    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    this.logger.log(`[AUTH] Change password for user: ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const currentPassword = dto.currentPassword || dto.oldPassword;
    if (!currentPassword) {
      throw new BadRequestException('Current/old password is required');
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hashedPassword },
      });
      await tx.userSession.deleteMany({ where: { userId } });
    });

    this.logger.log(`[AUTH] Password changed for user: ${userId}`);

    return { message: 'Password changed successfully. Please login again.' };
  }

  async logout(userId: string): Promise<{ message: string }> {
    this.logger.log(`[AUTH] Logout for user: ${userId}`);

    await this.prisma.userSession.deleteMany({
      where: { userId },
    });

    this.logger.log(`[AUTH] Logout successful: ${userId}`);

    return { message: 'Logged out successfully' };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        business: { select: { name: true } },
        userRoles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });
  }

  private async _generateTokens(userId: string, email: string, businessId: string, user: any) {
    const permissions = user.userRoles
      .flatMap((ur: any) => ur.role.permissions)
      .map((p: any) => p.key);

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        businessId,
        permissions,
      },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRATION') || '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        businessId,
        type: 'refresh',
      },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRATION') || '7d',
      },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }

  private async _createDefaultRolesAndPermissions(
    businessId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const existingRoles = await client.role.findMany({
      where: { businessId },
      include: { permissions: { select: { id: true, key: true } } },
    });

    const permissionsData = [
      { key: 'products.view', category: 'Products', action: 'view' },
      { key: 'products.create', category: 'Products', action: 'create' },
      { key: 'products.edit', category: 'Products', action: 'edit' },
      { key: 'products.delete', category: 'Products', action: 'delete' },
      { key: 'suppliers.view', category: 'Suppliers', action: 'view' },
      { key: 'suppliers.create', category: 'Suppliers', action: 'create' },
      { key: 'suppliers.edit', category: 'Suppliers', action: 'edit' },
      { key: 'suppliers.delete', category: 'Suppliers', action: 'delete' },
      { key: 'customers.view', category: 'Customers', action: 'view' },
      { key: 'customers.create', category: 'Customers', action: 'create' },
      { key: 'customers.edit', category: 'Customers', action: 'edit' },
      { key: 'customers.delete', category: 'Customers', action: 'delete' },
      { key: 'purchases.view', category: 'Purchases', action: 'view' },
      { key: 'purchases.create', category: 'Purchases', action: 'create' },
      { key: 'purchases.edit', category: 'Purchases', action: 'edit' },
      { key: 'purchases.approve', category: 'Purchases', action: 'approve' },
      { key: 'purchases.cancel', category: 'Purchases', action: 'cancel' },
      { key: 'sales.view', category: 'Sales', action: 'view' },
      { key: 'sales.create', category: 'Sales', action: 'create' },
      { key: 'sales.edit', category: 'Sales', action: 'edit' },
      { key: 'sales.discount', category: 'Sales', action: 'discount' },
      { key: 'sales.approve', category: 'Sales', action: 'approve' },
      { key: 'sales.cancel', category: 'Sales', action: 'cancel' },
      { key: 'inventory.view', category: 'Inventory', action: 'view' },
      { key: 'inventory.adjust', category: 'Inventory', action: 'adjust' },
      { key: 'inventory.transfer', category: 'Inventory', action: 'transfer' },
      { key: 'payments.view', category: 'Payments', action: 'view' },
      { key: 'payments.create', category: 'Payments', action: 'create' },
      { key: 'payments.delete', category: 'Payments', action: 'delete' },
      { key: 'expenses.view', category: 'Expenses', action: 'view' },
      { key: 'expenses.create', category: 'Expenses', action: 'create' },
      { key: 'expenses.edit', category: 'Expenses', action: 'edit' },
      { key: 'expenses.delete', category: 'Expenses', action: 'delete' },
      { key: 'expenses.approve', category: 'Expenses', action: 'approve' },
      { key: 'expenses.pay', category: 'Expenses', action: 'pay' },
      { key: 'reports.view', category: 'Reports', action: 'view' },
      { key: 'reports.export', category: 'Reports', action: 'export' },
      { key: 'users.view', category: 'Users', action: 'view' },
      { key: 'users.create', category: 'Users', action: 'create' },
      { key: 'users.edit', category: 'Users', action: 'edit' },
      { key: 'users.delete', category: 'Users', action: 'delete' },
      { key: 'roles.manage', category: 'Roles', action: 'manage' },
      { key: 'settings.view', category: 'Settings', action: 'view' },
      { key: 'settings.edit', category: 'Settings', action: 'edit' },
      { key: 'audit.view', category: 'Audit', action: 'view' },
    ];

    const existingPermissions = await client.permission.findMany({
      where: { businessId },
      select: { id: true, key: true },
    });
    const existingPermissionKeys = new Set(existingPermissions.map((p) => p.key));
    const missingPermissions = permissionsData.filter((p) => !existingPermissionKeys.has(p.key));
    if (missingPermissions.length) {
      await client.permission.createMany({
        data: missingPermissions.map((p) => ({
          id: uuid(),
          businessId,
          key: p.key,
          name: p.key.replace('_', ' ').toUpperCase(),
          category: p.category,
          action: p.action,
        })),
        skipDuplicates: true,
      });
    }
    const createdPermissions = await client.permission.findMany({ where: { businessId } });

    const rolesConfig = [
      {
        name: 'Owner',
        isSystem: true,
        permissionKeys: createdPermissions.map((p) => p.key),
      },
      {
        name: 'Admin',
        isSystem: true,
        permissionKeys: createdPermissions
          .filter((p) => !['users.delete', 'roles.manage'].includes(p.key))
          .map((p) => p.key),
      },
      {
        name: 'Manager',
        isSystem: true,
        permissionKeys: [
          'products.view',
          'products.create',
          'products.edit',
          'suppliers.view',
          'suppliers.create',
          'suppliers.edit',
          'customers.view',
          'customers.create',
          'customers.edit',
          'purchases.view',
          'purchases.create',
          'purchases.edit',
          'purchases.approve',
          'sales.view',
          'sales.create',
          'sales.edit',
          'sales.discount',
          'sales.approve',
          'inventory.view',
          'inventory.adjust',
          'inventory.transfer',
          'payments.view',
          'payments.create',
          'expenses.view',
          'expenses.create',
          'expenses.edit',
          'expenses.approve',
          'expenses.pay',
          'reports.view',
          'reports.export',
          'audit.view',
        ],
      },
      {
        name: 'Salesperson',
        isSystem: true,
        permissionKeys: [
          'products.view',
          'customers.view',
          'sales.view',
          'sales.create',
          'sales.edit',
          'sales.discount',
          'inventory.view',
          'payments.view',
          'payments.create',
          'reports.view',
        ],
      },
    ];

    const roles = [];
    for (const roleConfig of rolesConfig) {
      const current = existingRoles.find((role) => role.name === roleConfig.name);
      const desired = createdPermissions.filter((p) => roleConfig.permissionKeys.includes(p.key));
      const currentPermissionIds = new Set(current?.permissions.map((p) => p.id) || []);
      const missingRolePermissions = desired.filter(
        (permission) => !currentPermissionIds.has(permission.id),
      );
      if (current) {
        roles.push(
          missingRolePermissions.length
            ? await client.role.update({
                where: { id: current.id },
                data: {
                  permissions: { connect: missingRolePermissions.map((p) => ({ id: p.id })) },
                },
                include: { permissions: true },
              })
            : current,
        );
      } else {
        roles.push(
          await client.role.create({
            data: {
              id: uuid(),
              businessId,
              name: roleConfig.name,
              isSystem: roleConfig.isSystem,
              permissions: { connect: desired.map((p) => ({ id: p.id })) },
            },
            include: { permissions: true },
          }),
        );
      }
    }

    this.logger.log(`[AUTH] Default roles & permissions created for business: ${businessId}`);

    return roles;
  }

  private async _sendPasswordResetEmail(
    businessId: string,
    email: string,
    firstName: string,
    resetToken: string,
  ) {
    try {
      const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      const resetUrl = new URL('/reset-password', frontendUrl);
      resetUrl.searchParams.set('token', resetToken);
      const queued = await this.notifications.enqueuePasswordResetEmail({
        businessId,
        email,
        firstName,
        resetLink: resetUrl.toString(),
      });
      if (queued) this.logger.log(`[AUTH] Password reset email queued for ${email}`);
    } catch {
      // Keep account existence private and do not return or log the reset token.
      this.logger.error(`[AUTH] Unable to queue password reset email for ${email}`);
    }
  }
}
