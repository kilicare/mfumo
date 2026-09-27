import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { SupplierService } from './supplier.service';
import { CustomerService } from './customer.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierResponseDto,
  SupplierFilterDto,
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerResponseDto,
  CustomerFilterDto,
} from './dto';

@ApiTags('Suppliers & Customers')
@Controller('suppliers-customers')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class SupplierCustomerController {
  constructor(
    private supplierService: SupplierService,
    private customerService: CustomerService,
  ) {}

  // ============================================================
  // SUPPLIERS
  // ============================================================

  /**
   * POST /suppliers-customers/suppliers
   * Create supplier
   */
  @Post('suppliers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('suppliers.create')
  @ApiOperation({ summary: 'Create supplier' })
  @ApiResponse({ status: 201, type: SupplierResponseDto })
  async createSupplier(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.createSupplier(businessId, userId, dto);
  }

  /**
   * GET /suppliers-customers/suppliers/:id
   * Get supplier by ID
   */
  @Get('suppliers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('suppliers.view')
  @ApiOperation({ summary: 'Get supplier by ID' })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async getSupplierById(
    @Business() businessId: string,
    @Param('id') supplierId: string,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.getSupplierById(businessId, supplierId);
  }

  /**
   * GET /suppliers-customers/suppliers
   * Get all suppliers with filtering
   */
  @Get('suppliers')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('suppliers.view')
  @ApiOperation({ summary: 'Get all suppliers' })
  @ApiResponse({ status: 200 })
  async getAllSuppliers(
    @Business() businessId: string,
    @Query() filter: SupplierFilterDto,
  ) {
    return this.supplierService.getAllSuppliers(businessId, filter);
  }

  /**
   * PATCH /suppliers-customers/suppliers/:id
   * Update supplier
   */
  @Patch('suppliers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('suppliers.edit')
  @ApiOperation({ summary: 'Update supplier' })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  async updateSupplier(
    @Business() businessId: string,
    @Param('id') supplierId: string,
    @UserId() userId: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.updateSupplier(businessId, supplierId, userId, dto);
  }

  /**
   * DELETE /suppliers-customers/suppliers/:id
   * Delete supplier
   */
  @Delete('suppliers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('suppliers.delete')
  @ApiOperation({ summary: 'Delete supplier' })
  @ApiResponse({ status: 200 })
  async deleteSupplier(
    @Business() businessId: string,
    @Param('id') supplierId: string,
    @UserId() userId: string,
  ) {
    return this.supplierService.deleteSupplier(businessId, supplierId, userId);
  }

  /**
   * GET /suppliers-customers/suppliers/:id/statement
   * Get supplier statement (aging report)
   */
  @Get('suppliers/:id/statement')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('suppliers.view')
  @ApiOperation({ summary: 'Get supplier statement' })
  @ApiResponse({ status: 200 })
  async getSupplierStatement(
    @Business() businessId: string,
    @Param('id') supplierId: string,
    @Query('month') month?: string,
  ) {
    return this.supplierService.getSupplierStatement(businessId, supplierId, month);
  }

  // ============================================================
  // CUSTOMERS
  // ============================================================

  /**
   * POST /suppliers-customers/customers
   * Create customer
   */
  @Post('customers')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('customers.create')
  @ApiOperation({ summary: 'Create customer' })
  @ApiResponse({ status: 201, type: CustomerResponseDto })
  async createCustomer(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.customerService.createCustomer(businessId, userId, dto);
  }

  /**
   * GET /suppliers-customers/customers/:id
   * Get customer by ID
   */
  @Get('customers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  async getCustomerById(
    @Business() businessId: string,
    @Param('id') customerId: string,
  ): Promise<CustomerResponseDto> {
    return this.customerService.getCustomerById(businessId, customerId);
  }

  /**
   * GET /suppliers-customers/customers
   * Get all customers with filtering
   */
  @Get('customers')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'Get all customers' })
  @ApiResponse({ status: 200 })
  async getAllCustomers(
    @Business() businessId: string,
    @Query() filter: CustomerFilterDto,
  ) {
    return this.customerService.getAllCustomers(businessId, filter);
  }

  /**
   * PATCH /suppliers-customers/customers/:id
   * Update customer
   */
  @Patch('customers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers.edit')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  async updateCustomer(
    @Business() businessId: string,
    @Param('id') customerId: string,
    @UserId() userId: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.customerService.updateCustomer(businessId, customerId, userId, dto);
  }

  /**
   * DELETE /suppliers-customers/customers/:id
   * Delete customer
   */
  @Delete('customers/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers.delete')
  @ApiOperation({ summary: 'Delete customer' })
  @ApiResponse({ status: 200 })
  async deleteCustomer(
    @Business() businessId: string,
    @Param('id') customerId: string,
    @UserId() userId: string,
  ) {
    return this.customerService.deleteCustomer(businessId, customerId, userId);
  }

  /**
   * GET /suppliers-customers/customers/:id/statement
   * Get customer statement (aging report)
   */
  @Get('customers/:id/statement')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'Get customer statement' })
  @ApiResponse({ status: 200 })
  async getCustomerStatement(
    @Business() businessId: string,
    @Param('id') customerId: string,
    @Query('month') month?: string,
  ) {
    return this.customerService.getCustomerStatement(businessId, customerId, month);
  }
}
