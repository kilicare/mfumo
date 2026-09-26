import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Get,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowAnonymous } from '../common/decorators';
import { CurrentUser } from '../common/decorators/auth.decorator';
import { UserId } from '../common/decorators/auth.decorator';
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

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  @Post('register')
  @AllowAnonymous()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new business and admin user' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    const ipAddress = req.ip || 'unknown';
    return this.authService.login(dto, ipAddress);
  }

  @Post('refresh')
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200 })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const payload = this.jwtService.decode(dto.refreshToken) as any;
    const userId = payload?.sub;
    if (!userId) {
      throw new BadRequestException('Invalid refresh token');
    }
    return this.authService.refreshToken(dto, userId);
  }

  @Post('forgot-password')
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset link' })
  @ApiResponse({ status: 200, type: PasswordResetRequestDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<PasswordResetRequestDto> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200 })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (requires authentication)' })
  @ApiResponse({ status: 200 })
  async changePassword(
    @UserId() userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(userId, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200 })
  async logout(@UserId() userId: string): Promise<{ message: string }> {
    return this.authService.logout(userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({ status: 200 })
  async getCurrentUser(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      businessId: user.businessId,
      roles: user.userRoles.map((ur: any) => ur.role.name),
      permissions: user.userRoles.flatMap((ur: any) => ur.role.permissions).map((p: any) => p.key),
    };
  }
}
