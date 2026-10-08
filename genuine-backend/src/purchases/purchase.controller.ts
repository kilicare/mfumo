import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { PurchaseService } from './purchase.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CreateGRNDto,
  UpdateGRNDto,
  CreatePurchaseReturnDto,
  PurchaseOrderResponseDto,
  GRNResponseDto,
  PurchaseReturnResponseDto,
  PurchaseOrderFilterDto,
  CreatePurchasePaymentDto,
  RejectGRNDto,
  PurchasePaymentResponseDto,
} from './dto';

@ApiTags('Purchases')
@Controller('purchases')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class PurchaseController {
  constructor(private purchaseService: PurchaseService) {}

  // ============================================================
  // PURCHASE ORDERS
  // ============================================================

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('purchases.create')
  @ApiOperation({ summary: 'Create purchase order' })
  @ApiResponse({ status: 201, type: PurchaseOrderResponseDto })
  async createPurchaseOrder(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseService.createPurchaseOrder(businessId, userId, dto);
  }

  @Get('orders')
  @RequirePermission('purchases.view')
  @ApiOperation({ summary: 'List purchase orders' })
  @ApiResponse({ status: 200, type: [PurchaseOrderResponseDto] })
  async getAllPurchaseOrders(
    @Business() businessId: string,
    @Query() filter: PurchaseOrderFilterDto,
  ): Promise<{ data: PurchaseOrderResponseDto[]; total: number; page: number; limit: number }> {
    return this.purchaseService.getAllPurchaseOrders(businessId, filter);
  }

  @Get('orders/:id')
  @RequirePermission('purchases.view')
  @ApiOperation({ summary: 'Get purchase order by ID' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async getPurchaseOrderById(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) poId: string,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseService.getPurchaseOrderById(businessId, poId);
  }

  @Post('orders/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('payments.create')
  @ApiOperation({ summary: 'Record a payment against a purchase order' })
  @ApiResponse({ status: 201, type: PurchasePaymentResponseDto })
  async createPurchasePayment(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) poId: string,
    @UserId() userId: string,
    @Body() dto: CreatePurchasePaymentDto,
  ): Promise<PurchasePaymentResponseDto> {
    return this.purchaseService.createPurchasePayment(businessId, poId, userId, dto);
  }

  @Put('orders/:id')
  @RequirePermission('purchases.edit')
  @ApiOperation({ summary: 'Update purchase order' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async updatePurchaseOrder(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) poId: string,
    @UserId() userId: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseService.updatePurchaseOrder(businessId, poId, userId, dto);
  }

  @Patch('orders/:id')
  @RequirePermission('purchases.edit')
  @ApiOperation({ summary: 'Patch purchase order' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async patchPurchaseOrder(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) poId: string,
    @UserId() userId: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseService.updatePurchaseOrder(businessId, poId, userId, dto);
  }

  @Post('orders/:id/approve')
  @RequirePermission('purchases.approve')
  @ApiOperation({ summary: 'Approve purchase order' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async approvePurchaseOrder(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) poId: string,
    @UserId() userId: string,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseService.approvePurchaseOrder(businessId, poId, userId);
  }

  @Post('orders/:id/cancel')
  @RequirePermission('purchases.cancel')
  @ApiOperation({ summary: 'Cancel purchase order' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  async cancelPurchaseOrder(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) poId: string,
    @UserId() userId: string,
    @Body('reason') reason?: string,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseService.cancelPurchaseOrder(businessId, poId, userId, reason || '');
  }

  // ============================================================
  // GOODS RECEIVED NOTES (GRN)
  // ============================================================

  @Post('grn')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('purchases.create')
  @ApiOperation({ summary: 'Create goods received note' })
  @ApiResponse({ status: 201, type: GRNResponseDto })
  async createGRN(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateGRNDto,
  ): Promise<GRNResponseDto> {
    return this.purchaseService.createGRN(businessId, userId, dto);
  }

  @Get('grn')
  @RequirePermission('purchases.view')
  @ApiOperation({ summary: 'List goods received notes' })
  @ApiQuery({ name: 'purchaseOrderId', required: false, type: String })
  @ApiResponse({ status: 200, type: [GRNResponseDto] })
  async getAllGRNs(
    @Business() businessId: string,
    @Query('purchaseOrderId') poId?: string,
  ): Promise<GRNResponseDto[]> {
    return this.purchaseService.getAllGRNs(businessId, poId);
  }

  @Get('grn/:id')
  @RequirePermission('purchases.view')
  @ApiOperation({ summary: 'Get GRN by ID' })
  @ApiResponse({ status: 200, type: GRNResponseDto })
  async getGRNById(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) grnId: string,
  ): Promise<GRNResponseDto> {
    return this.purchaseService.getGRNById(businessId, grnId);
  }

  @Put('grn/:id')
  @RequirePermission('purchases.edit')
  @ApiOperation({ summary: 'Update GRN' })
  @ApiResponse({ status: 200, type: GRNResponseDto })
  async updateGRN(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) grnId: string,
    @UserId() userId: string,
    @Body() dto: UpdateGRNDto,
  ): Promise<GRNResponseDto> {
    return this.purchaseService.updateGRN(businessId, grnId, userId, dto);
  }

  @Patch('grn/:id')
  @RequirePermission('purchases.edit')
  @ApiOperation({ summary: 'Patch GRN' })
  @ApiResponse({ status: 200, type: GRNResponseDto })
  async patchGRN(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) grnId: string,
    @UserId() userId: string,
    @Body() dto: UpdateGRNDto,
  ): Promise<GRNResponseDto> {
    return this.purchaseService.updateGRN(businessId, grnId, userId, dto);
  }

  @Post('grn/:id/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('purchases.approve')
  @ApiOperation({ summary: 'Accept GRN (QC Pass & Stock In)' })
  @ApiResponse({ status: 200, type: GRNResponseDto })
  async acceptGRN(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) grnId: string,
    @UserId() userId: string,
  ): Promise<GRNResponseDto> {
    return this.purchaseService.acceptGRN(businessId, grnId, userId);
  }

  @Post('grn/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('purchases.approve')
  @ApiOperation({ summary: 'Reject GRN' })
  @ApiResponse({ status: 200, type: GRNResponseDto })
  async rejectGRN(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) grnId: string,
    @UserId() userId: string,
    @Body() dto: RejectGRNDto,
  ): Promise<GRNResponseDto> {
    return this.purchaseService.rejectGRN(businessId, grnId, userId, dto.reason);
  }

  // ============================================================
  // PURCHASE RETURNS
  // ============================================================

  @Post('returns')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('purchases.create')
  @ApiOperation({ summary: 'Create purchase return' })
  @ApiResponse({ status: 201, type: PurchaseReturnResponseDto })
  async createPurchaseReturn(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreatePurchaseReturnDto,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseService.createPurchaseReturn(businessId, userId, dto);
  }

  @Get('returns')
  @RequirePermission('purchases.view')
  @ApiOperation({ summary: 'List purchase returns' })
  @ApiQuery({ name: 'purchaseOrderId', required: false, type: String })
  @ApiResponse({ status: 200, type: [PurchaseReturnResponseDto] })
  async getAllPurchaseReturns(
    @Business() businessId: string,
    @Query('purchaseOrderId') poId?: string,
  ): Promise<PurchaseReturnResponseDto[]> {
    return this.purchaseService.getAllPurchaseReturns(businessId, poId);
  }

  @Get('returns/:id')
  @RequirePermission('purchases.view')
  @ApiOperation({ summary: 'Get purchase return by ID' })
  @ApiResponse({ status: 200, type: PurchaseReturnResponseDto })
  async getPurchaseReturnById(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) returnId: string,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseService.getPurchaseReturnById(businessId, returnId);
  }

  @Post('returns/:id/approve')
  @RequirePermission('purchases.approve')
  @ApiOperation({ summary: 'Approve purchase return' })
  @ApiResponse({ status: 200, type: PurchaseReturnResponseDto })
  async approvePurchaseReturn(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) returnId: string,
    @UserId() userId: string,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseService.approvePurchaseReturn(businessId, returnId, userId);
  }

  @Post('returns/:id/reject')
  @RequirePermission('purchases.approve')
  @ApiOperation({ summary: 'Reject purchase return' })
  @ApiResponse({ status: 200, type: PurchaseReturnResponseDto })
  async rejectPurchaseReturn(
    @Business() businessId: string,
    @Param('id', new ParseUUIDPipe()) returnId: string,
    @UserId() userId: string,
    @Body('reason') reason?: string,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseService.rejectPurchaseReturn(businessId, returnId, userId, reason || '');
  }
}
