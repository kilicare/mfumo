import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Reject posting dates inside locked or closed business periods. */
export async function assertAccountingPeriodOpen(
  tx: Prisma.TransactionClient,
  businessId: string,
  date: Date,
): Promise<void> {
  const period = await tx.accountingPeriod.findFirst({
    where: {
      businessId,
      startDate: { lte: date },
      endDate: { gte: date },
      status: { in: ['LOCKED', 'CLOSED'] },
    },
    select: { period: true, status: true },
  });
  if (period) {
    throw new ConflictException(
      `Transactions are blocked for ${period.status.toLowerCase()} period ${period.period}`,
    );
  }
}
