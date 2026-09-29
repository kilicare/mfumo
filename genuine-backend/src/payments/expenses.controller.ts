import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from '../business/dto';
import { PaymentsService } from './payments.service';
import { ExpensesService } from './expenses.service';
import {
  ApproveExpenseDto,
  CreateExpenseDto,
  ExpenseFilterDto,
  PayExpenseDto,
  RejectExpenseDto,
  UpdateExpenseDto,
} from './dto';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('payments/expenses')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly payments: PaymentsService,
  ) {}

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('expenses.create')
  createCategory(
    @Business() businessId: string,
    @UserId() userId: string,
    @Body() dto: CreateExpenseCategoryDto,
  ) {
    return this.expenses.createCategory(businessId, userId, dto);
  }

  @Get('categories')
  @RequirePermission('expenses.view')
  listCategories(@Business() businessId: string, @Query('activeOnly') activeOnly?: string) {
    return this.expenses.listCategories(businessId, activeOnly === 'true');
  }

  @Get('categories/:id')
  @RequirePermission('expenses.view')
  getCategory(@Business() businessId: string, @Param('id') id: string) {
    return this.expenses.getCategory(businessId, id);
  }

  @Patch('categories/:id')
  @RequirePermission('expenses.edit')
  updateCategory(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.expenses.updateCategory(businessId, userId, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermission('expenses.delete')
  deleteCategory(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.expenses.deleteCategory(businessId, userId, id);
  }

  @Get('reports/summary')
  @RequirePermission('expenses.view')
  summary(@Business() businessId: string, @Query() query: ExpenseFilterDto) {
    return this.expenses.getExpenseSummary(businessId, query.fromDate, query.toDate);
  }

  @Get('reports/budget-status')
  @RequirePermission('expenses.view')
  budgetStatus(@Business() businessId: string, @Query('date') date?: string) {
    return this.expenses.getBudgetStatus(businessId, date);
  }

  @Get('reports/trends')
  @RequirePermission('expenses.view')
  trends(@Business() businessId: string, @Query() query: ExpenseFilterDto) {
    return this.expenses.getExpenseTrends(businessId, query.months as unknown as string);
  }

  @Post(['', 'create'])
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('expenses.create')
  create(@Business() businessId: string, @UserId() userId: string, @Body() dto: CreateExpenseDto) {
    return this.expenses.createExpense(businessId, userId, dto);
  }

  @Get()
  @RequirePermission('expenses.view')
  list(@Business() businessId: string, @Query() query: ExpenseFilterDto) {
    return this.expenses.listExpenses(businessId, query);
  }

  @Get(':id')
  @RequirePermission('expenses.view')
  get(@Business() businessId: string, @Param('id') id: string) {
    return this.expenses.getExpenseById(businessId, id);
  }

  @Patch(':id')
  @RequirePermission('expenses.edit')
  update(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.updateExpense(businessId, userId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('expenses.delete')
  delete(@Business() businessId: string, @UserId() userId: string, @Param('id') id: string) {
    return this.expenses.deleteExpense(businessId, userId, id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('expenses.create')
  submit(@Business() businessId: string, @UserId() userId: string, @Param('id') id: string) {
    return this.expenses.submitForApproval(businessId, userId, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('expenses.approve')
  approve(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: ApproveExpenseDto,
  ) {
    return this.expenses.approveExpense(businessId, userId, id, dto.notes);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('expenses.approve')
  reject(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
  ) {
    return this.expenses.rejectExpense(businessId, userId, id, dto.reason);
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('expenses.pay', 'payments.create')
  pay(
    @Business() businessId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: PayExpenseDto,
  ) {
    return this.payments.payExpense(businessId, userId, id, dto);
  }
}
