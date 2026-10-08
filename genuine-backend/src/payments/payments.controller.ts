import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import {
  CloseAccountingPeriodDto,
  CreateAccountingPeriodDto,
  CreatePaymentDto,
  FinancialReportQueryDto,
  PaymentListQueryDto,
  ReconcilePaymentDto,
  VoidPaymentDto,
} from './dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments & Financial Management')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('payments.create')
  createPayment(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.payments.createPayment(businessId, userId, dto);
  }

  @Get()
  @RequirePermission('payments.view')
  listPayments(@Business() businessId: string, @Query() query: PaymentListQueryDto) {
    return this.payments.getAllPayments(businessId, query);
  }

  @Get('methods')
  @RequirePermission('payments.create')
  paymentMethodsForEntry(@Business() businessId: string) {
    return this.payments.getPaymentMethodsForEntry(businessId);
  }

  @Post(':id/reconcile')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payments.create')
  reconcile(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: ReconcilePaymentDto,
  ) {
    return this.payments.reconcilePayment(businessId, userId, id, dto);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payments.create')
  void(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: VoidPaymentDto,
  ) {
    return this.payments.voidPayment(businessId, userId, id, dto);
  }

  @Post('periods/create')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('settings.edit')
  createPeriod(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateAccountingPeriodDto,
  ) {
    return this.payments.createAccountingPeriod(businessId, userId, dto);
  }

  @Get('periods')
  @RequirePermission('settings.view')
  listPeriods(@Business() businessId: string) {
    return this.payments.listAccountingPeriods(businessId);
  }

  @Get('periods/:id')
  @RequirePermission('settings.view')
  getPeriod(@Business() businessId: string, @Param('id') id: string) {
    return this.payments.getAccountingPeriodById(businessId, id);
  }

  @Post('periods/:id/lock')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.edit')
  lockPeriod(@Business() businessId: string, @UserId() userId: string, @Param('id') id: string) {
    return this.payments.lockAccountingPeriod(businessId, userId, id);
  }

  @Post('periods/:id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.edit')
  closePeriod(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: CloseAccountingPeriodDto,
  ) {
    return this.payments.closeAccountingPeriod(businessId, userId, id, dto);
  }

  @Get('reports/income-statement')
  @RequirePermission('reports.view')
  incomeStatement(@Business() businessId: string, @Query() query: FinancialReportQueryDto) {
    return this.payments.getIncomeStatement(businessId, query);
  }

  @Get('reports/cash-flow')
  @RequirePermission('reports.view')
  cashFlow(@Business() businessId: string, @Query() query: FinancialReportQueryDto) {
    return this.payments.getCashFlowReport(businessId, query);
  }

  @Get('reports/receivables-ageing')
  @RequirePermission('reports.view')
  receivables(@Business() businessId: string, @Query() query: FinancialReportQueryDto) {
    return this.payments.getReceivablesAgeingReport(businessId, query);
  }

  @Get('reports/payables-ageing')
  @RequirePermission('reports.view')
  payables(@Business() businessId: string, @Query() query: FinancialReportQueryDto) {
    return this.payments.getPayablesAgeingReport(businessId, query);
  }

  @Get('reports/trial-balance')
  @RequirePermission('reports.view')
  trialBalance(@Business() businessId: string, @Query() query: FinancialReportQueryDto) {
    return this.payments.getTrialBalanceReport(businessId, query);
  }

  @Get('reports/financial-summary')
  @RequirePermission('reports.view')
  financialSummary(@Business() businessId: string, @Query() query: FinancialReportQueryDto) {
    return this.payments.getFinancialSummary(businessId, query);
  }

  // Keep the generic ID route from swallowing named collections such as
  // /payments/expenses. Prisma IDs in this API are CUIDs or UUIDs.
  @Get(':id([A-Za-z0-9-]{20,36})')
  @RequirePermission('payments.view')
  getPayment(@Business() businessId: string, @Param('id') id: string) {
    return this.payments.getPaymentById(businessId, id);
  }
}
