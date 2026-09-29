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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import {
  CreatePhysicalCountDto,
  CreateStockAdjustmentDto,
  CreateStockTransferDto,
  ExpiryReportDto,
  InventoryMovementReportDto,
  LowStockReportDto,
  ReceiveStockTransferDto,
  RejectInventoryDto,
  StockAgeingReportDto,
  StockValuationReportDto,
} from './dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Create a pending stock adjustment' })
  createAdjustment(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    return this.inventory.createStockAdjustment(businessId, userId, dto);
  }

  @Get('adjustments/:id')
  @RequirePermission('inventory.view')
  getAdjustment(@Business() businessId: string, @Param('id') id: string) {
    return this.inventory.getStockAdjustmentById(businessId, id);
  }

  @Post('adjustments/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.adjust')
  approveAdjustment(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.inventory.approveStockAdjustment(businessId, id, userId);
  }

  @Post('adjustments/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.adjust')
  rejectAdjustment(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: RejectInventoryDto,
  ) {
    return this.inventory.rejectStockAdjustment(businessId, id, userId, dto.reason);
  }

  @Post('transfers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventory.transfer')
  createTransfer(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateStockTransferDto,
  ) {
    return this.inventory.createStockTransfer(businessId, userId, dto);
  }

  @Get('transfers/:id')
  @RequirePermission('inventory.view')
  getTransfer(@Business() businessId: string, @Param('id') id: string) {
    return this.inventory.getStockTransferById(businessId, id);
  }

  @Post('transfers/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.transfer')
  sendTransfer(@Business() businessId: string, @UserId() userId: string, @Param('id') id: string) {
    return this.inventory.sendStockTransfer(businessId, id, userId);
  }

  @Post('transfers/:id/receive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.transfer')
  receiveTransfer(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: ReceiveStockTransferDto,
  ) {
    return this.inventory.receiveStockTransfer(businessId, id, userId, dto?.receivedQuantities);
  }

  @Post('counts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('inventory.adjust')
  createCount(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreatePhysicalCountDto,
  ) {
    return this.inventory.createPhysicalCount(businessId, userId, dto);
  }

  @Get('counts/:id')
  @RequirePermission('inventory.view')
  getCount(@Business() businessId: string, @Param('id') id: string) {
    return this.inventory.getPhysicalCountById(businessId, id);
  }

  @Post('counts/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.adjust')
  completeCount(@Business() businessId: string, @UserId() userId: string, @Param('id') id: string) {
    return this.inventory.completePhysicalCount(businessId, id, userId);
  }

  @Post('counts/:id/post')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventory.adjust')
  postCount(@Business() businessId: string, @UserId() userId: string, @Param('id') id: string) {
    return this.inventory.postPhysicalCount(businessId, id, userId);
  }

  @Get('reports/valuation')
  @RequirePermission('inventory.view')
  valuation(@Business() businessId: string, @Query() filter: StockValuationReportDto) {
    return this.inventory.getStockValuationReport(businessId, filter);
  }

  @Get('reports/low-stock')
  @RequirePermission('inventory.view')
  lowStock(@Business() businessId: string, @Query() filter: LowStockReportDto) {
    return this.inventory.getLowStockReport(businessId, filter);
  }

  @Get('reports/expiry')
  @RequirePermission('inventory.view')
  expiry(@Business() businessId: string, @Query() filter: ExpiryReportDto) {
    return this.inventory.getStockExpiryReport(businessId, filter);
  }

  @Get('reports/ageing')
  @RequirePermission('inventory.view')
  ageing(@Business() businessId: string, @Query() filter: StockAgeingReportDto) {
    return this.inventory.getStockAgeingReport(businessId, filter);
  }

  @Get('reports/movements')
  @RequirePermission('inventory.view')
  movements(@Business() businessId: string, @Query() filter: InventoryMovementReportDto) {
    return this.inventory.getInventoryMovementReport(businessId, filter);
  }

  @Get('dashboard')
  @RequirePermission('inventory.view')
  @ApiOperation({ summary: 'Get inventory KPIs and recent movements' })
  dashboard(@Business() businessId: string) {
    return this.inventory.getInventoryDashboard(businessId);
  }
}
