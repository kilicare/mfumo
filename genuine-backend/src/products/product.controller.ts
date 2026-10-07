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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { ProductService } from './product.service';
import { CreateUnitDto, UpdateUnitDto } from '../business/dto/unit.dto';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateBrandDto,
  UpdateBrandDto,
  ProductResponseDto,
  CategoryResponseDto,
  BrandResponseDto,
  BulkUpdatePriceDto,
  BulkUpdateStatusDto,
  BulkImportProductsDto,
  ProductFilterDto,
} from './dto';

@ApiTags('Products')
@Controller('products')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class ProductController {
  constructor(private productService: ProductService) {}

  // ============================================================
  // CATEGORIES (Must come before :id to avoid conflicts)
  // ============================================================

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.create')
  @ApiOperation({ summary: 'Create product category' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  async createCategory(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.productService.createCategory(businessId, userId, dto);
  }

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get all product categories' })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  async getCategories(@Business() businessId: string): Promise<CategoryResponseDto[]> {
    return this.productService.getCategories(businessId);
  }

  @Get('categories/hierarchy')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get category hierarchy' })
  @ApiResponse({ status: 200 })
  async getCategoryHierarchy(@Business() businessId: string) {
    return this.productService.getCategoryHierarchy(businessId);
  }

  @Get('units')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get active standard and business-specific product units' })
  async getUnits(@Business() businessId: string) {
    return this.productService.getUnits(businessId);
  }

  @Post('units')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.create')
  @ApiOperation({ summary: 'Create a unit owned by the current business' })
  async createUnit(@Business() businessId: string, @Body() dto: CreateUnitDto) {
    return this.productService.createUnit(businessId, dto);
  }

  @Patch('units/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.edit')
  @ApiOperation({ summary: 'Update a unit owned by the current business' })
  async updateUnit(
    @Business() businessId: string,
    @Param('id') unitId: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.productService.updateUnit(businessId, unitId, dto);
  }

  @Delete('units/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.delete')
  @ApiOperation({ summary: 'Delete an unused unit owned by the current business' })
  async deleteUnit(@Business() businessId: string, @Param('id') unitId: string) {
    return this.productService.deleteUnit(businessId, unitId);
  }

  @Patch('categories/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.edit')
  @ApiOperation({ summary: 'Update product category' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  async updateCategory(
    @Business() businessId: string,
    @Param('id') categoryId: string,
    @UserId() userId: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.productService.updateCategory(businessId, categoryId, userId, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.delete')
  @ApiOperation({ summary: 'Delete product category' })
  @ApiResponse({ status: 200 })
  async deleteCategory(@Business() businessId: string, @Param('id') categoryId: string) {
    return this.productService.deleteCategory(businessId, categoryId);
  }

  // ============================================================
  // BRANDS (Must come before :id to avoid conflicts)
  // ============================================================

  @Post('brands')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.create')
  @ApiOperation({ summary: 'Create product brand' })
  @ApiResponse({ status: 201, type: BrandResponseDto })
  async createBrand(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateBrandDto,
  ): Promise<BrandResponseDto> {
    return this.productService.createBrand(businessId, userId, dto);
  }

  @Get('brands')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get all product brands' })
  @ApiResponse({ status: 200, type: [BrandResponseDto] })
  async getBrands(@Business() businessId: string): Promise<BrandResponseDto[]> {
    return this.productService.getBrands(businessId);
  }

  @Patch('brands/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.edit')
  @ApiOperation({ summary: 'Update product brand' })
  @ApiResponse({ status: 200, type: BrandResponseDto })
  async updateBrand(
    @Business() businessId: string,
    @Param('id') brandId: string,
    @UserId() userId: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandResponseDto> {
    return this.productService.updateBrand(businessId, brandId, userId, dto);
  }

  @Delete('brands/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.delete')
  @ApiOperation({ summary: 'Delete product brand' })
  @ApiResponse({ status: 200 })
  async deleteBrand(@Business() businessId: string, @Param('id') brandId: string) {
    return this.productService.deleteBrand(businessId, brandId);
  }

  // ============================================================
  // BULK OPERATIONS (Must come before :id to avoid conflicts)
  // ============================================================

  @Post('bulk/prices')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.edit')
  @ApiOperation({ summary: 'Bulk update product prices' })
  @ApiResponse({ status: 200 })
  async bulkUpdatePrices(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: BulkUpdatePriceDto,
  ) {
    return this.productService.bulkUpdatePrices(businessId, userId, dto);
  }

  @Post('bulk/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.edit')
  @ApiOperation({ summary: 'Bulk update product status' })
  @ApiResponse({ status: 200 })
  async bulkUpdateStatus(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: BulkUpdateStatusDto,
  ) {
    return this.productService.bulkUpdateStatus(businessId, userId, dto);
  }

  @Post('bulk/import')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.create')
  @ApiOperation({ summary: 'Bulk import products' })
  @ApiResponse({ status: 201 })
  async bulkImportProducts(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: BulkImportProductsDto,
  ) {
    return this.productService.bulkImportProducts(businessId, userId, dto);
  }

  // ============================================================
  // PRODUCTS
  // ============================================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('products.create')
  @ApiOperation({ summary: 'Create new product' })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  async createProduct(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productService.createProduct(businessId, userId, dto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  async getProductById(
    @Business() businessId: string,
    @Param('id') productId: string,
  ): Promise<ProductResponseDto> {
    return this.productService.getProductById(businessId, productId);
  }

  @Get(':id/images/:imageId')
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get a product image within the authenticated business' })
  async getProductImage(
    @Business() businessId: string,
    @Param('id') productId: string,
    @Param('imageId') imageId: string,
    @Res() response: Response,
  ) {
    const image = await this.productService.getProductImage(businessId, productId, imageId);
    response.set({
      'Content-Type': image.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
    return response.send(Buffer.from(image.data));
  }

  @Get(':id/stock')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get business-scoped stock by location for a product' })
  async getProductStock(@Business() businessId: string, @Param('id') productId: string) {
    return this.productService.getProductStock(businessId, productId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.view')
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({ status: 200 })
  async getAllProducts(@Business() businessId: string, @Query() filter: ProductFilterDto) {
    return this.productService.getAllProducts(businessId, filter);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.edit')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  async updateProduct(
    @Business() businessId: string,
    @Param('id') productId: string,
    @UserId() userId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productService.updateProduct(businessId, productId, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.delete')
  @ApiOperation({ summary: 'Delete product' })
  @ApiResponse({ status: 200 })
  async deleteProduct(
    @Business() businessId: string,
    @Param('id') productId: string,
    @UserId() userId: string,
  ) {
    return this.productService.deleteProduct(businessId, productId, userId);
  }
}
