import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { JwtAuthGuard, PermissionGuard } from '../common/guards';
import {
  ApplyDiscountDto,
  CreateSalesInvoiceDto,
  CreateSalesReturnDto,
  SalesCancelDto,
  SalesInvoiceFilterDto,
  SalesInvoiceResponseDto,
  SalesPaymentDto,
  SalesPaymentResponseDto,
  SalesRejectDto,
  SalesReturnFilterDto,
  SalesReturnResponseDto,
  UpdateSalesInvoiceDto,
} from './dto';
import { SalesService } from './sales.service';

@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('options')
  @RequirePermission('sales.view', 'sales.create', 'sales.edit')
  @ApiOperation({
    summary:
      'Get active locations, salespeople and tax settings for sales filters and invoice entry',
  })
  invoiceOptions(@Business() businessId: string) {
    return this.salesService.getInvoiceOptions(businessId);
  }

  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('sales.create')
  @ApiOperation({ summary: 'Create a draft sales invoice' })
  @ApiResponse({ status: 201, type: SalesInvoiceResponseDto })
  createInvoice(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateSalesInvoiceDto,
  ) {
    return this.salesService.createSalesInvoice(businessId, userId, dto);
  }

  @Get('invoices')
  @RequirePermission('sales.view')
  @ApiOperation({ summary: 'List invoices with filters and pagination' })
  getInvoices(@Business() businessId: string, @Query() filter: SalesInvoiceFilterDto) {
    return this.salesService.getAllSalesInvoices(businessId, filter);
  }

  @Get('invoices/:id')
  @RequirePermission('sales.view')
  @ApiResponse({ status: 200, type: SalesInvoiceResponseDto })
  getInvoice(@Business() businessId: string, @Param('id') id: string) {
    return this.salesService.getSalesInvoiceById(businessId, id);
  }

  @Patch('invoices/:id')
  @RequirePermission('sales.edit')
  updateInvoice(
    @Business() businessId: string,
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() dto: UpdateSalesInvoiceDto,
  ) {
    return this.salesService.updateSalesInvoice(businessId, id, userId, dto);
  }

  @Post('invoices/:id/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sales.approve')
  @ApiOperation({ summary: 'Approve and issue an invoice; deducts stock once' })
  issueInvoice(@Business() businessId: string, @Param('id') id: string, @UserId() userId: string) {
    return this.salesService.issueSalesInvoice(businessId, id, userId);
  }

  @Post('invoices/:id/discount')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sales.discount')
  applyDiscount(
    @Business() businessId: string,
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.salesService.applyDiscount(businessId, id, userId, dto);
  }

  @Post('invoices/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('payments.create')
  @ApiResponse({ status: 201, type: SalesPaymentResponseDto })
  createPayment(
    @Business() businessId: string,
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() dto: SalesPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.salesService.createSalesPayment(businessId, id, userId, dto, idempotencyKey);
  }

  @Post('invoices/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sales.cancel')
  cancelInvoice(
    @Business() businessId: string,
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() dto: SalesCancelDto,
  ) {
    return this.salesService.cancelSalesInvoice(businessId, id, userId, dto);
  }

  @Post('returns')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('sales.create')
  @ApiResponse({ status: 201, type: SalesReturnResponseDto })
  createReturn(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateSalesReturnDto,
  ) {
    return this.salesService.createSalesReturn(businessId, userId, dto);
  }

  @Get('returns')
  @RequirePermission('sales.view')
  getReturns(@Business() businessId: string, @Query() filter: SalesReturnFilterDto) {
    return this.salesService.getAllSalesReturns(businessId, filter);
  }

  @Get('returns/:id')
  @RequirePermission('sales.view')
  getReturn(@Business() businessId: string, @Param('id') id: string) {
    return this.salesService.getSalesReturnById(businessId, id);
  }

  @Post('returns/:id/authorize')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sales.approve')
  authorizeReturn(
    @Business() businessId: string,
    @Param('id') id: string,
    @UserId() userId: string,
  ) {
    return this.salesService.authorizeSalesReturn(businessId, id, userId);
  }

  @Post('returns/:id/receive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sales.approve')
  receiveReturn(@Business() businessId: string, @Param('id') id: string, @UserId() userId: string) {
    return this.salesService.receiveSalesReturn(businessId, id, userId);
  }

  @Post('returns/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sales.approve')
  rejectReturn(
    @Business() businessId: string,
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() dto: SalesRejectDto,
  ) {
    return this.salesService.rejectSalesReturn(businessId, id, userId, dto);
  }
}
