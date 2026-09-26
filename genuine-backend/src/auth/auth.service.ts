import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../database/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
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
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    this.logger.log(`[AUTH] Register attempt: ${dto.email}`);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException(`Email ${dto.email} already registered`);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const business = await this.prisma.business.create({
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

    const user = await this.prisma.user.create({
      data: {
        id: uuid(),
        email: dto.email,
        passwordHash: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        businessId: business.id,
        isActive: true,
      },
    });

    const roles = await this._createDefaultRolesAndPermissions(business.id);

    const ownerRole = roles.find((r) => r.name === 'Owner');
    if (ownerRole) {
      await this.prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: ownerRole.id,
        },
      });
    }

    const userWithDetails = await this.prisma.user.findUnique({
      where: { id: user.id },
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

    const tokens = await this._generateTokens(user.id, user.email, business.id, userWithDetails);

    this.logger.log(`[AUTH] Registration successful: ${user.email} (Business: ${business.id})`);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        businessId: business.id,
        businessName: business.name,
        roles: userWithDetails.userRoles.map((ur) => ur.role.name),
        permissions: userWithDetails.userRoles
          .flatMap((ur) => ur.role.permissions)
          .map((p) => p.key),
      },
    };
  }

  async login(dto: LoginDto, ipAddress: string): Promise<AuthResponseDto> {
    this.logger.log(`[AUTH] Login attempt: ${dto.email}`);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`[AUTH] Invalid password for ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

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
        firstName: user.firstName,
        lastName: user.lastName,
        businessId: user.businessId,
        businessName: '',
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
      await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session expired or not found');
    }

    const isTokenValid = await bcrypt.compare(dto.refreshToken, session.refreshTokenHash);
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
    this.logger.log(`[AUTH] Forgot password request: ${dto.email}`);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      return {
        message: 'If email exists, password reset link has been sent',
        email: dto.email,
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

    await this._sendPasswordResetEmail(user.email, user.firstName, resetToken);

    this.logger.log(`[AUTH] Password reset link sent to: ${user.email}`);

    return {
      message: 'If email exists, password reset link has been sent',
      email: dto.email,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    this.logger.log(`[AUTH] Reset password attempt`);

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.token, {
        secret: this.config.get('JWT_RESET_SECRET'),
      });
    } catch (error) {
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

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });

    await this.prisma.userSession.deleteMany({
      where: { userId: user.id },
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

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hashedPassword,
      },
    });

    await this.prisma.userSession.deleteMany({
      where: { userId },
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

  private async _createDefaultRolesAndPermissions(businessId: string) {
    const existingRoles = await this.prisma.role.findMany({
      where: { businessId },
    });

    if (existingRoles.length > 0) {
      return existingRoles;
    }

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

    const createdPermissions = await Promise.all(
      permissionsData.map((p) =>
        this.prisma.permission.create({
          data: {
            id: uuid(),
            business: {
              connect: { id: businessId },
            },
            key: p.key,
            name: p.key.replace('_', ' ').toUpperCase(),
            category: p.category,
            action: p.action,
          },
        }),
      ),
    );

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

    const roles = await Promise.all(
      rolesConfig.map((roleConfig) =>
        this.prisma.role.create({
          data: {
            id: uuid(),
            businessId,
            name: roleConfig.name,
            isSystem: roleConfig.isSystem,
            permissions: {
              connect: createdPermissions
                .filter((p) => roleConfig.permissionKeys.includes(p.key))
                .map((p) => ({ id: p.id })),
            },
          },
          include: {
            permissions: true,
          },
        }),
      ),
    );

    this.logger.log(`[AUTH] Default roles & permissions created for business: ${businessId}`);

    return roles;
  }

  private async _sendPasswordResetEmail(email: string, firstName: string, resetToken: string) {
    const resetLink = `${this.config.get('FRONTEND_URL')}/auth/reset-password?token=${resetToken}`;
    this.logger.log(`[EMAIL] Password reset link for ${email}: ${resetLink}`);
  }
}
