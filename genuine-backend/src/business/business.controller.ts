import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { BusinessService } from './business.service';
import {
  BusinessSetupDto,
  UpdateBusinessProfileDto,
  BusinessProfileResponseDto,
  CreateLocationDto,
  UpdateLocationDto,
  LocationResponseDto,
  CreatePaymentMethodDto,
  PaymentMethodResponseDto,
  CreateExpenseCategoryDto,
  ExpenseCategoryResponseDto,
  BusinessSetupResponseDto,
} from './dto';

@ApiTags('Business Setup')
@Controller('business')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class BusinessController {
  constructor(private businessService: BusinessService) {}

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('settings.edit')
  @ApiOperation({ summary: 'Setup new business (first-run wizard)' })
  @ApiResponse({ status: 201, type: BusinessSetupResponseDto })
  async setupBusiness(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: BusinessSetupDto,
  ): Promise<BusinessSetupResponseDto> {
    return this.businessService.setupBusiness(businessId, userId, dto);
  }

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.view')
  @ApiOperation({ summary: 'Get business profile' })
  @ApiResponse({ status: 200, type: BusinessProfileResponseDto })
  async getBusinessProfile(@Business() businessId: string): Promise<BusinessProfileResponseDto> {
    return this.businessService.getBusinessProfile(businessId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.edit')
  @ApiOperation({ summary: 'Update business profile' })
  @ApiResponse({ status: 200, type: BusinessProfileResponseDto })
  async updateBusinessProfile(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: UpdateBusinessProfileDto,
  ): Promise<BusinessProfileResponseDto> {
    return this.businessService.updateBusinessProfile(businessId, userId, dto);
  }

  @Get('setup-status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.view')
  @ApiOperation({ summary: 'Get setup status' })
  @ApiResponse({ status: 200 })
  async getSetupStatus(@Business() businessId: string) {
    return this.businessService.getSetupStatus(businessId);
  }

  @Post('locations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('settings.edit')
  @ApiOperation({ summary: 'Create location' })
  @ApiResponse({ status: 201, type: LocationResponseDto })
  async createLocation(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateLocationDto,
  ): Promise<LocationResponseDto> {
    return this.businessService.createLocation(businessId, userId, dto);
  }

  @Get('locations')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.view')
  @ApiOperation({ summary: 'Get all locations' })
  @ApiResponse({ status: 200, type: [LocationResponseDto] })
  async getLocations(@Business() businessId: string): Promise<LocationResponseDto[]> {
    return this.businessService.getLocations(businessId);
  }

  @Patch('locations/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.edit')
  @ApiOperation({ summary: 'Update location' })
  @ApiResponse({ status: 200, type: LocationResponseDto })
  async updateLocation(
    @Business() businessId: string,
    @Param('id') locationId: string,
    @UserId() userId: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<LocationResponseDto> {
    return this.businessService.updateLocation(businessId, locationId, userId, dto);
  }

  @Post('payment-methods')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('settings.edit')
  @ApiOperation({ summary: 'Create payment method' })
  @ApiResponse({ status: 201, type: PaymentMethodResponseDto })
  async createPaymentMethod(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.businessService.createPaymentMethod(businessId, userId, dto);
  }

  @Get('payment-methods')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.view')
  @ApiOperation({ summary: 'Get all payment methods' })
  @ApiResponse({ status: 200, type: [PaymentMethodResponseDto] })
  async getPaymentMethods(@Business() businessId: string): Promise<PaymentMethodResponseDto[]> {
    return this.businessService.getPaymentMethods(businessId);
  }

  @Post('expense-categories')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('settings.edit')
  @ApiOperation({ summary: 'Create expense category' })
  @ApiResponse({ status: 201, type: ExpenseCategoryResponseDto })
  async createExpenseCategory(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateExpenseCategoryDto,
  ): Promise<ExpenseCategoryResponseDto> {
    return this.businessService.createExpenseCategory(businessId, userId, dto);
  }

  @Get('expense-categories')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.view')
  @ApiOperation({ summary: 'Get all expense categories' })
  @ApiResponse({ status: 200, type: [ExpenseCategoryResponseDto] })
  async getExpenseCategories(
    @Business() businessId: string,
  ): Promise<ExpenseCategoryResponseDto[]> {
    return this.businessService.getExpenseCategories(businessId);
  }

  @Get('units')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.view')
  @ApiOperation({ summary: 'Get all units' })
  @ApiResponse({ status: 200 })
  async getUnits() {
    return this.businessService.getUnits();
  }
}
