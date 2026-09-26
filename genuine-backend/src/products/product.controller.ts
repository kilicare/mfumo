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
import { Business } from '../common/decorators/business.decorator';
import { UserId } from '../common/decorators/auth.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { ProductService } from './product.service';
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
@UseGuards(JwtAuthGuard)
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
  async getBrands(): Promise<BrandResponseDto[]> {
    return this.productService.getBrands();
  }

  @Patch('brands/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.edit')
  @ApiOperation({ summary: 'Update product brand' })
  @ApiResponse({ status: 200, type: BrandResponseDto })
  async updateBrand(
    @Param('id') brandId: string,
    @UserId() userId: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandResponseDto> {
    return this.productService.updateBrand(brandId, userId, dto);
  }

  @Delete('brands/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('products.delete')
  @ApiOperation({ summary: 'Delete product brand' })
  @ApiResponse({ status: 200 })
  async deleteBrand(@Param('id') brandId: string) {
    return this.productService.deleteBrand(brandId);
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
  async deleteProduct(@Business() businessId: string, @Param('id') productId: string) {
    return this.productService.deleteProduct(businessId, productId);
  }
}
