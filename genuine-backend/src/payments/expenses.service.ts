import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateExpenseDto,
  CreateExpenseItemDto,
  ExpenseFilterDto,
  ExpenseStatus,
  UpdateExpenseDto,
} from './dto';
import { ExpenseBudgetPeriod } from '../business/dto/expense-category.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto';
import {
  CreateExpenseCategoryDto,
  ExpenseCategoryResponseDto,
  UpdateExpenseCategoryDto,
} from '../business/dto';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const BUDGETED_EXPENSE_STATUSES = [
  ExpenseStatus.PENDING_APPROVAL,
  ExpenseStatus.APPROVED,
  ExpenseStatus.PAID,
];
const RECOGNIZED_EXPENSE_STATUSES = [ExpenseStatus.APPROVED, ExpenseStatus.PAID];

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createCategory(businessId: string, userId: string, dto: CreateExpenseCategoryDto) {
    this.validateBudgetPair(dto.budgetLimit, dto.budgetPeriod);
    const name = dto.name.trim();
    const code = this.normalizeCode(dto.code || name);
    if (!name || !code) throw new BadRequestException('Category name and code are required');
    try {
      const category = await this.prisma.$transaction(async (tx) => {
        const row = await tx.expenseCategory.create({
          data: {
            businessId,
            name,
            code,
            description: dto.description?.trim() || null,
            budgetLimit: dto.budgetLimit == null ? null : roundMoney(dto.budgetLimit),
            budgetPeriod: dto.budgetPeriod ?? null,
            isActive: dto.isActive ?? true,
          },
        });
        await this.audit(tx, businessId, userId, 'ExpenseCategory', row.id, 'CREATE', null, row);
        return row;
      });
      return this.mapCategory(category);
    } catch (error) {
      this.mapUniqueError(error, 'Expense category name or code already exists in this business');
    }
  }

  async listCategories(businessId: string, activeOnly = false) {
    const categories = await this.prisma.expenseCategory.findMany({
      where: { businessId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: 'asc' },
    });
    return categories.map((row) => this.mapCategory(row));
  }

  async getCategory(businessId: string, id: string) {
    const row = await this.prisma.expenseCategory.findFirst({ where: { id, businessId } });
    if (!row) throw new NotFoundException('Expense category not found');
    return this.mapCategory(row);
  }

  async updateCategory(
    businessId: string,
    userId: string,
    id: string,
    dto: UpdateExpenseCategoryDto,
  ) {
    const before = await this.prisma.expenseCategory.findFirst({ where: { id, businessId } });
    if (!before) throw new NotFoundException('Expense category not found');
    const budgetLimit = dto.budgetLimit === undefined ? before.budgetLimit : dto.budgetLimit;
    const budgetPeriod = dto.budgetPeriod === undefined ? before.budgetPeriod : dto.budgetPeriod;
    this.validateBudgetPair(budgetLimit, budgetPeriod);
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException('Category name cannot be empty');
    if (dto.code !== undefined && !this.normalizeCode(dto.code))
      throw new BadRequestException('Category code must contain letters or numbers');
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.expenseCategory.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.code !== undefined && { code: this.normalizeCode(dto.code) }),
            ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
            ...(dto.budgetLimit !== undefined && {
              budgetLimit: dto.budgetLimit == null ? null : roundMoney(dto.budgetLimit),
            }),
            ...(dto.budgetPeriod !== undefined && { budgetPeriod: dto.budgetPeriod ?? null }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
        });
        await this.audit(tx, businessId, userId, 'ExpenseCategory', id, 'UPDATE', before, row);
        return row;
      });
      return this.mapCategory(updated);
    } catch (error) {
      this.mapUniqueError(error, 'Expense category name or code already exists in this business');
    }
  }

  async deleteCategory(businessId: string, userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.expenseCategory.findFirst({ where: { id, businessId } });
      if (!row) throw new NotFoundException('Expense category not found');
      const useCount = await tx.expense.count({
        where: { businessId, OR: [{ categoryId: id }, { items: { some: { categoryId: id } } }] },
      });
      if (useCount > 0)
        throw new ConflictException('Category has expenses; deactivate it to preserve history');
      await this.audit(tx, businessId, userId, 'ExpenseCategory', id, 'DELETE', row, null);
      await tx.expenseCategory.delete({ where: { id } });
      return { message: 'Expense category deleted' };
    });
  }

  async createExpense(businessId: string, userId: string, dto: CreateExpenseDto) {
    if (dto.isPaid)
      throw new BadRequestException('Expenses must be approved and paid through the workflow');
    const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();
    if (!Number.isFinite(expenseDate.getTime()))
      throw new BadRequestException('Invalid expenseDate');
    const items = this.prepareItems(dto.items, dto.expenseCategoryId);
    const amount = this.sumItems(items);
    this.assertTotal(dto.totalAmount, amount);
    const mainCategoryId = dto.expenseCategoryId || items[0].categoryId;
    const reference = dto.reference?.trim() || dto.referenceNumber?.trim() || null;
    const id = await this.prisma
      .$transaction(async (tx) => {
        await this.validateExpenseRelations(tx, businessId, {
          categoryIds: items.map((item) => item.categoryId),
          locationId: dto.locationId,
          supplierId: dto.supplierId,
          paymentMethodId: dto.paymentMethodId,
        });
        await this.assertPeriodOpen(tx, businessId, expenseDate);
        const expenseNumber =
          dto.expenseNumber?.trim() || (await this.nextExpenseNumber(tx, businessId, expenseDate));
        const row = await tx.expense.create({
          data: {
            businessId,
            expenseNumber,
            expenseDate,
            categoryId: mainCategoryId,
            amount,
            description:
              dto.description?.trim() ||
              items
                .map((item) => item.description)
                .filter(Boolean)
                .join('; ') ||
              'Business expense',
            reference,
            attachmentUrl: dto.attachmentUrl ?? dto.attachment ?? null,
            budgetCode: dto.budgetCode?.trim() || null,
            paymentMethodId: dto.paymentMethodId ?? null,
            locationId: dto.locationId ?? null,
            supplierId: dto.supplierId ?? null,
            status: ExpenseStatus.DRAFT,
            isPaid: false,
            createdBy: userId,
            notes: dto.notes ?? null,
            items: { create: items.map((item) => ({ ...item })) },
          },
          select: { id: true },
        });
        await this.audit(tx, businessId, userId, 'Expense', row.id, 'CREATE', null, {
          expenseNumber,
          amount,
          categoryId: mainCategoryId,
          items,
        });
        return row.id;
      })
      .catch((error) =>
        this.mapUniqueError(error, 'Expense number is already in use in this business'),
      );
    return this.getExpenseById(businessId, id);
  }

  async getExpenseById(businessId: string, id: string) {
    const row = await this.prisma.expense.findFirst({
      where: { id, businessId },
      include: this.expenseInclude(),
    });
    if (!row) throw new NotFoundException('Expense not found');
    return this.mapExpense(row);
  }

  async listExpenses(businessId: string, filter: ExpenseFilterDto) {
    if (filter.fromDate && filter.toDate && filter.fromDate > filter.toDate)
      throw new BadRequestException('fromDate must be on or before toDate');
    if (filter.minAmount != null && filter.maxAmount != null && filter.minAmount > filter.maxAmount)
      throw new BadRequestException('minAmount must be less than or equal to maxAmount');
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const where: Prisma.ExpenseWhereInput = {
      businessId,
      ...(filter.status && { status: filter.status }),
      ...(filter.categoryId && {
        OR: [
          { categoryId: filter.categoryId },
          { items: { some: { categoryId: filter.categoryId } } },
        ],
      }),
      ...(filter.supplierId && { supplierId: filter.supplierId }),
      ...(filter.fromDate || filter.toDate
        ? {
            expenseDate: {
              ...(filter.fromDate && { gte: new Date(`${filter.fromDate}T00:00:00.000Z`) }),
              ...(filter.toDate && { lte: new Date(`${filter.toDate}T23:59:59.999Z`) }),
            },
          }
        : {}),
      ...(filter.minAmount != null || filter.maxAmount != null
        ? {
            amount: {
              ...(filter.minAmount != null && { gte: filter.minAmount }),
              ...(filter.maxAmount != null && { lte: filter.maxAmount }),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: this.expenseInclude(),
        orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data: data.map((row) => this.mapExpense(row)), total, page, limit };
  }

  async updateExpense(businessId: string, userId: string, id: string, dto: UpdateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const before = await tx.expense.findFirst({
        where: { id, businessId },
        include: { items: true },
      });
      if (!before) throw new NotFoundException('Expense not found');
      if (before.status !== ExpenseStatus.DRAFT)
        throw new ConflictException('Only draft expenses can be updated');
      const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : before.expenseDate;
      if (!Number.isFinite(expenseDate.getTime()))
        throw new BadRequestException('Invalid expenseDate');
      await this.assertPeriodOpen(tx, businessId, expenseDate);

      const inputItems = dto.items
        ? this.prepareItems(dto.items, dto.expenseCategoryId ?? before.categoryId)
        : undefined;
      const mainCategoryId = dto.expenseCategoryId ?? before.categoryId;
      const finalItems =
        inputItems ??
        before.items.map((item) => ({
          categoryId: item.categoryId,
          amount: roundMoney(item.amount),
        }));
      const amount = this.sumItems(finalItems);
      this.assertTotal(dto.totalAmount, amount);

      await this.validateExpenseRelations(tx, businessId, {
        categoryIds: [mainCategoryId, ...finalItems.map((item) => item.categoryId)],
        locationId:
          dto.locationId === undefined ? before.locationId : (dto.locationId ?? undefined),
        supplierId:
          dto.supplierId === undefined ? before.supplierId : (dto.supplierId ?? undefined),
        paymentMethodId:
          dto.paymentMethodId === undefined
            ? before.paymentMethodId
            : (dto.paymentMethodId ?? undefined),
      });

      const reference = dto.reference !== undefined ? dto.reference : dto.referenceNumber;
      const attachment = dto.attachmentUrl !== undefined ? dto.attachmentUrl : dto.attachment;
      const updated = await tx.expense.update({
        where: { id },
        data: {
          categoryId: mainCategoryId,
          amount,
          ...(dto.expenseDate !== undefined && { expenseDate }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(reference !== undefined && { reference }),
          ...(attachment !== undefined && { attachmentUrl: attachment }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.budgetCode !== undefined && { budgetCode: dto.budgetCode }),
          ...(dto.locationId !== undefined && { locationId: dto.locationId ?? null }),
          ...(dto.supplierId !== undefined && { supplierId: dto.supplierId ?? null }),
          ...(dto.paymentMethodId !== undefined && {
            paymentMethodId: dto.paymentMethodId ?? null,
          }),
          ...(inputItems && {
            items: {
              deleteMany: {},
              create: inputItems.map((item) => ({ ...item })),
            },
          }),
        },
        include: this.expenseInclude(),
      });
      await this.audit(tx, businessId, userId, 'Expense', id, 'UPDATE', before, updated);
      return this.mapExpense(updated);
    });
  }

  async deleteExpense(businessId: string, userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const row = await tx.expense.findFirst({ where: { id, businessId } });
      if (!row) throw new NotFoundException('Expense not found');
      if (row.status !== ExpenseStatus.DRAFT)
        throw new ConflictException('Only draft expenses can be deleted');
      await this.audit(tx, businessId, userId, 'Expense', id, 'DELETE', row, null);
      await tx.expense.delete({ where: { id } });
      return { message: 'Draft expense deleted' };
    });
  }

  async submitForApproval(businessId: string, userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const before = await tx.expense.findFirst({
        where: { id, businessId },
        include: { items: true },
      });
      if (!before) throw new NotFoundException('Expense not found');
      if (before.status !== ExpenseStatus.DRAFT)
        throw new ConflictException('Only draft expenses can be submitted');
      await this.assertPeriodOpen(tx, businessId, before.expenseDate);
      await this.assertBudgets(tx, businessId, before.items, before.expenseDate, id);
      const updated = await tx.expense.update({
        where: { id },
        data: { status: ExpenseStatus.PENDING_APPROVAL },
      });
      await this.audit(tx, businessId, userId, 'Expense', id, 'SUBMIT', before, updated);
      return id;
    });
    return this.getExpenseById(businessId, id);
  }

  async approveExpense(businessId: string, userId: string, id: string, notes?: string) {
    const approved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const before = await tx.expense.findFirst({
        where: { id, businessId },
        include: { items: true },
      });
      if (!before) throw new NotFoundException('Expense not found');
      if (
        ![ExpenseStatus.DRAFT, ExpenseStatus.PENDING_APPROVAL].includes(
          before.status as ExpenseStatus,
        )
      )
        throw new ConflictException('Only draft or pending expenses can be approved');
      if (before.createdBy === userId)
        throw new ConflictException('The expense creator cannot approve their own expense');
      await this.assertPeriodOpen(tx, businessId, before.expenseDate);
      await this.assertBudgets(tx, businessId, before.items, before.expenseDate, id);
      const updated = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.APPROVED,
          approvedBy: userId,
          approvedAt: new Date(),
          approvalNotes: notes?.trim() || null,
          rejectionReason: null,
          rejectedBy: null,
          rejectedAt: null,
        },
      });
      await this.audit(tx, businessId, userId, 'Expense', id, 'APPROVE', before, updated);
      return updated;
    });
    await this.notifications.publishEvent({
      businessId,
      eventType: NotificationEventType.EXPENSE_APPROVED,
      referenceId: id,
      referenceType: 'Expense',
      variables: { expenseNumber: approved.expenseNumber, amount: approved.amount },
    });
    return this.getExpenseById(businessId, id);
  }

  async rejectExpense(businessId: string, userId: string, id: string, reason: string) {
    const cleanReason = reason?.trim();
    if (!cleanReason) throw new BadRequestException('A rejection reason is required');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
      const before = await tx.expense.findFirst({ where: { id, businessId } });
      if (!before) throw new NotFoundException('Expense not found');
      if (
        ![ExpenseStatus.DRAFT, ExpenseStatus.PENDING_APPROVAL].includes(
          before.status as ExpenseStatus,
        )
      )
        throw new ConflictException('Only draft or pending expenses can be rejected');
      const updated = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.REJECTED,
          rejectionReason: cleanReason,
          rejectedBy: userId,
          rejectedAt: new Date(),
        },
      });
      await this.audit(tx, businessId, userId, 'Expense', id, 'REJECT', before, updated);
      return id;
    });
    return this.getExpenseById(businessId, id);
  }

  async getExpenseSummary(businessId: string, from?: string, to?: string) {
    const range = this.parseDateRange(from, to);
    const rows = await this.prisma.expense.findMany({
      where: { businessId, ...(range && { expenseDate: range }) },
      include: { category: true, items: { include: { category: true } } },
    });
    const recognized = rows.filter((row) =>
      RECOGNIZED_EXPENSE_STATUSES.includes(row.status as ExpenseStatus),
    );
    const totalExpenses = roundMoney(recognized.reduce((sum, row) => sum + row.amount, 0));
    const totalApproved = roundMoney(
      rows
        .filter((row) => row.status === ExpenseStatus.APPROVED)
        .reduce((sum, row) => sum + row.amount, 0),
    );
    const totalPaid = roundMoney(
      rows
        .filter((row) => row.status === ExpenseStatus.PAID)
        .reduce((sum, row) => sum + row.amount, 0),
    );
    const totalPending = roundMoney(
      rows
        .filter((row) => row.status === ExpenseStatus.PENDING_APPROVAL)
        .reduce((sum, row) => sum + row.amount, 0),
    );
    const totalRejected = roundMoney(
      rows
        .filter((row) => row.status === ExpenseStatus.REJECTED)
        .reduce((sum, row) => sum + row.amount, 0),
    );
    const byCategory = new Map<string, { category: string; ids: Set<string>; total: number }>();
    for (const row of recognized) {
      // Older expense rows predate ExpenseItem records. Attribute those rows
      // to their header category so category totals still reconcile to totals.
      const items = row.items.length
        ? row.items
        : [{ categoryId: row.categoryId, category: row.category, amount: row.amount }];
      for (const item of items) {
        const current = byCategory.get(item.categoryId) || {
          category: item.category.name,
          ids: new Set<string>(),
          total: 0,
        };
        current.ids.add(row.id);
        current.total += item.amount;
        byCategory.set(item.categoryId, current);
      }
    }
    return {
      totalExpenses,
      totalApproved,
      totalPaid,
      totalPending,
      totalRejected,
      averageExpenseAmount: recognized.length ? roundMoney(totalExpenses / recognized.length) : 0,
      largestExpense: recognized.length ? Math.max(...recognized.map((row) => row.amount)) : 0,
      smallestExpense: recognized.length ? Math.min(...recognized.map((row) => row.amount)) : 0,
      byCategory: [...byCategory.values()].map((entry) => ({
        category: entry.category,
        count: entry.ids.size,
        total: roundMoney(entry.total),
        percentage: totalExpenses ? roundMoney((entry.total / totalExpenses) * 100) : 0,
      })),
    };
  }

  async getBudgetStatus(businessId: string, asOfInput?: string | Date) {
    const asOf =
      asOfInput instanceof Date ? asOfInput : asOfInput ? new Date(asOfInput) : new Date();
    if (!Number.isFinite(asOf.getTime())) throw new BadRequestException('Invalid budget date');
    const categories = await this.prisma.expenseCategory.findMany({
      where: { businessId, isActive: true, budgetLimit: { not: null } },
      orderBy: { name: 'asc' },
    });
    const results = await Promise.all(
      categories.map(async (category) => {
        if (category.budgetLimit == null || !category.budgetPeriod) {
          return {
            categoryId: category.id,
            categoryName: category.name,
            budgetLimit: category.budgetLimit ?? 0,
            budgetPeriod: (category.budgetPeriod ||
              ExpenseBudgetPeriod.MONTHLY) as ExpenseBudgetPeriod,
            spent: 0,
            available: category.budgetLimit ?? 0,
            utilization: 0,
            status: 'ON_TRACK' as const,
          };
        }
        const bounds = this.budgetRange(asOf, category.budgetPeriod as ExpenseBudgetPeriod);
        const spent = await this.sumCommittedCategoryItems(
          this.prisma,
          businessId,
          category.id,
          bounds.start,
          bounds.end,
        );
        const limit = roundMoney(category.budgetLimit);
        const available = roundMoney(Math.max(0, limit - spent));
        const utilization = limit === 0 ? (spent > 0 ? 100 : 0) : roundMoney((spent / limit) * 100);
        return {
          categoryId: category.id,
          categoryName: category.name,
          budgetLimit: limit,
          budgetPeriod: category.budgetPeriod as ExpenseBudgetPeriod,
          spent,
          available,
          utilization,
          status:
            spent > limit
              ? ('EXCEEDED' as const)
              : utilization >= 80
                ? ('WARNING' as const)
                : ('ON_TRACK' as const),
        };
      }),
    );
    return results;
  }

  async getExpenseTrends(businessId: string, monthsInput?: string) {
    const months = monthsInput === undefined ? 6 : Number(monthsInput);
    if (!Number.isInteger(months) || months < 1 || months > 24)
      throw new BadRequestException('months must be an integer between 1 and 24');
    const now = new Date();
    const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
    const rows = await this.prisma.expense.findMany({
      where: {
        businessId,
        status: { in: RECOGNIZED_EXPENSE_STATUSES },
        expenseDate: { gte: firstMonth, lte: now },
      },
      include: { category: true, items: { include: { category: true } } },
    });
    const totals = new Map<string, { total: number; byCategory: Map<string, number> }>();
    for (let index = 0; index < months; index += 1) {
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
        .toISOString()
        .slice(0, 7);
      totals.set(month, { total: 0, byCategory: new Map() });
    }
    for (const row of rows) {
      const month = row.expenseDate.toISOString().slice(0, 7);
      const bucket = totals.get(month);
      if (!bucket) continue;
      bucket.total += row.amount;
      const items = row.items.length ? row.items : [{ category: row.category, amount: row.amount }];
      for (const item of items) {
        bucket.byCategory.set(
          item.category.name,
          (bucket.byCategory.get(item.category.name) || 0) + item.amount,
        );
      }
    }
    return [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, value]) => ({
        month,
        total: roundMoney(value.total),
        byCategory: [...value.byCategory.entries()]
          .map(([category, amount]) => ({ category, total: roundMoney(amount) }))
          .sort((left, right) => left.category.localeCompare(right.category)),
      }));
  }

  private prepareItems(items: CreateExpenseItemDto[], fallbackCategoryId?: string) {
    if (!Array.isArray(items) || items.length === 0)
      throw new BadRequestException('At least one expense item is required');
    return items.map((item) => {
      const categoryId = item.expenseCategoryId || fallbackCategoryId;
      if (!categoryId) throw new BadRequestException('Each item needs an expense category');
      const amount = roundMoney(Number(item.amount));
      if (!Number.isFinite(amount) || amount <= 0)
        throw new BadRequestException('Expense item amounts must be positive');
      return {
        categoryId,
        amount,
        description: item.description?.trim() || null,
        notes: item.notes?.trim() || null,
      };
    });
  }

  private sumItems(items: Array<{ amount: number }>) {
    return roundMoney(items.reduce((total, item) => total + item.amount, 0));
  }

  private assertTotal(provided: number | undefined, calculated: number) {
    if (provided !== undefined && roundMoney(Number(provided)) !== calculated)
      throw new BadRequestException('Items total must equal totalAmount');
  }

  private async validateExpenseRelations(
    tx: Prisma.TransactionClient,
    businessId: string,
    refs: {
      categoryIds: string[];
      locationId?: string | null;
      supplierId?: string | null;
      paymentMethodId?: string | null;
    },
  ) {
    const categoryIds = [...new Set(refs.categoryIds)];
    const categories = await tx.expenseCategory.findMany({
      where: { businessId, isActive: true, id: { in: categoryIds } },
      select: { id: true },
    });
    if (categories.length !== categoryIds.length)
      throw new NotFoundException(
        'One or more active expense categories were not found in this business',
      );
    if (refs.locationId) {
      const location = await tx.location.findFirst({
        where: { id: refs.locationId, businessId, isActive: true },
        select: { id: true },
      });
      if (!location) throw new NotFoundException('Active location not found');
    }
    if (refs.supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: refs.supplierId, businessId, isActive: true },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('Active supplier not found');
    }
    if (refs.paymentMethodId) {
      const method = await tx.paymentMethod.findFirst({
        where: { id: refs.paymentMethodId, businessId, isActive: true },
        select: { id: true },
      });
      if (!method) throw new NotFoundException('Active payment method not found');
    }
  }

  private async assertPeriodOpen(tx: Prisma.TransactionClient, businessId: string, date: Date) {
    const closedPeriod = await tx.accountingPeriod.findFirst({
      where: {
        businessId,
        startDate: { lte: date },
        endDate: { gte: date },
        status: { in: ['LOCKED', 'CLOSED'] },
      },
      select: { id: true, period: true, status: true },
    });
    if (closedPeriod)
      throw new ConflictException(
        `Transactions are blocked for ${closedPeriod.status.toLowerCase()} period ${closedPeriod.period}`,
      );
  }

  private async assertBudgets(
    tx: Prisma.TransactionClient,
    businessId: string,
    items: Array<{ categoryId: string; amount: number }>,
    expenseDate: Date,
    excludeExpenseId?: string,
  ) {
    const proposed = new Map<string, number>();
    for (const item of items)
      proposed.set(item.categoryId, roundMoney((proposed.get(item.categoryId) || 0) + item.amount));
    const ids = [...proposed.keys()].sort();
    if (ids.length) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "ExpenseCategory" WHERE "businessId" = ${businessId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
      );
    }
    const categories = await tx.expenseCategory.findMany({
      where: { businessId, id: { in: ids } },
    });
    if (categories.length !== ids.length)
      throw new NotFoundException('Expense category not found in this business');
    for (const category of categories) {
      if (!category.isActive)
        throw new ConflictException(`Expense category ${category.name} is inactive`);
      if (category.budgetLimit == null || category.budgetPeriod == null) continue;
      const bounds = this.budgetRange(expenseDate, category.budgetPeriod as ExpenseBudgetPeriod);
      const spent = await this.sumCommittedCategoryItems(
        tx,
        businessId,
        category.id,
        bounds.start,
        bounds.end,
        excludeExpenseId,
      );
      const proposedTotal = roundMoney(spent + (proposed.get(category.id) || 0));
      if (proposedTotal - category.budgetLimit > 0.001)
        throw new ConflictException(
          `Budget exceeded for ${category.name}: ${proposedTotal.toFixed(2)} / ${category.budgetLimit.toFixed(2)}`,
        );
    }
  }

  private async sumCommittedCategoryItems(
    client: Prisma.TransactionClient | PrismaService,
    businessId: string,
    categoryId: string,
    start: Date,
    end: Date,
    excludeExpenseId?: string,
  ) {
    const result = await client.expenseItem.aggregate({
      where: {
        categoryId,
        expense: {
          is: {
            businessId,
            status: { in: BUDGETED_EXPENSE_STATUSES },
            expenseDate: { gte: start, lte: end },
            ...(excludeExpenseId && { id: { not: excludeExpenseId } }),
          },
        },
      },
      _sum: { amount: true },
    });
    return roundMoney(result._sum.amount || 0);
  }

  private budgetRange(date: Date, period: ExpenseBudgetPeriod) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    let start: Date;
    let end: Date;
    if (period === ExpenseBudgetPeriod.MONTHLY) {
      start = new Date(Date.UTC(year, month, 1));
      end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    } else if (period === ExpenseBudgetPeriod.QUARTERLY) {
      const firstQuarterMonth = Math.floor(month / 3) * 3;
      start = new Date(Date.UTC(year, firstQuarterMonth, 1));
      end = new Date(Date.UTC(year, firstQuarterMonth + 3, 0, 23, 59, 59, 999));
    } else {
      start = new Date(Date.UTC(year, 0, 1));
      end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    }
    return { start, end };
  }

  private parseDateRange(from?: string, to?: string) {
    if (from && to && from > to)
      throw new BadRequestException('fromDate must be on or before toDate');
    if (!from && !to) return undefined;
    return {
      ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
      ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
    };
  }

  private validateBudgetPair(limit?: number | null, period?: string | null) {
    if ((limit == null) !== (period == null))
      throw new BadRequestException('budgetLimit and budgetPeriod must be configured together');
  }

  private normalizeCode(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
  }

  private async nextExpenseNumber(tx: Prisma.TransactionClient, businessId: string, date: Date) {
    const prefix = `EXP-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}-`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`expense-number:${businessId}:${prefix}`}, 0)) IS NULL AS locked`;
    const last = await tx.expense.findFirst({
      where: { businessId, expenseNumber: { startsWith: prefix } },
      orderBy: { expenseNumber: 'desc' },
      select: { expenseNumber: true },
    });
    const sequence = last ? Number(last.expenseNumber.slice(prefix.length)) + 1 : 1;
    if (sequence > 99999)
      throw new ConflictException('Expense number sequence exhausted for this month');
    return `${prefix}${String(sequence).padStart(5, '0')}`;
  }

  private expenseInclude() {
    return {
      category: true,
      location: true,
      supplier: { select: { id: true, name: true, supplierCode: true } },
      paymentMethod: { select: { id: true, name: true } },
      items: { include: { category: true } },
      createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      approvedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      paidByUser: { select: { id: true, firstName: true, lastName: true } },
      rejectedByUser: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  private mapExpense(row: any) {
    const userName = (user: any) => [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    return {
      id: row.id,
      businessId: row.businessId,
      expenseNumber: row.expenseNumber,
      expenseCategoryId: row.categoryId,
      categoryName: row.category.name,
      status: row.status,
      totalAmount: roundMoney(row.amount),
      isPaid: row.isPaid,
      reference: row.reference ?? undefined,
      expenseDate: row.expenseDate,
      description: row.description ?? undefined,
      items: row.items.map((item: any) => ({
        id: item.id,
        expenseCategoryId: item.categoryId,
        categoryName: item.category.name,
        description: item.description ?? undefined,
        amount: roundMoney(item.amount),
        notes: item.notes ?? undefined,
      })),
      attachment: row.attachmentUrl ?? undefined,
      notes: row.notes ?? undefined,
      location: row.location ? { id: row.location.id, name: row.location.name } : undefined,
      supplier: row.supplier
        ? { id: row.supplier.id, name: row.supplier.name, code: row.supplier.supplierCode }
        : undefined,
      paymentMethod: row.paymentMethod
        ? { id: row.paymentMethod.id, name: row.paymentMethod.name }
        : undefined,
      approvedBy: row.approvedByUser
        ? {
            id: row.approvedByUser.id,
            name: userName(row.approvedByUser),
            email: row.approvedByUser.email,
          }
        : undefined,
      approvedAt: row.approvedAt ?? undefined,
      approvalNotes: row.approvalNotes ?? undefined,
      paidBy: row.paidByUser
        ? { id: row.paidByUser.id, name: userName(row.paidByUser) }
        : undefined,
      paidAt: row.paidAt ?? undefined,
      paymentReference: row.paymentReference ?? undefined,
      rejectedBy: row.rejectedByUser
        ? { id: row.rejectedByUser.id, name: userName(row.rejectedByUser) }
        : undefined,
      rejectedAt: row.rejectedAt ?? undefined,
      rejectionReason: row.rejectionReason ?? undefined,
      createdBy: row.createdByUser
        ? {
            id: row.createdByUser.id,
            name: userName(row.createdByUser),
            email: row.createdByUser.email,
          }
        : null,
      budgetCode: row.budgetCode ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapCategory(row: ExpenseCategory): ExpenseCategoryResponseDto {
    return {
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      code: row.code,
      description: row.description ?? undefined,
      budgetLimit: row.budgetLimit == null ? undefined : roundMoney(row.budgetLimit),
      budgetPeriod: row.budgetPeriod as ExpenseBudgetPeriod | undefined,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    businessId: string,
    userId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        businessId,
        userId,
        entityType,
        entityId,
        action,
        beforeData: before == null ? null : JSON.stringify(before),
        afterData: after == null ? null : JSON.stringify(after),
        description: `${action} ${entityType}`,
      },
    });
  }

  private mapUniqueError(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictException(message);
    throw error;
  }
}
