import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SupportService } from './support.service';

type SupportPrismaMock = {
  user: { findFirst: jest.Mock };
  feedbackSubmission: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findFirstOrThrow: jest.Mock;
  };
  feedbackMessage: { create: jest.Mock; findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createPrismaMock(): SupportPrismaMock {
  const prisma = {
    user: { findFirst: jest.fn() },
    feedbackSubmission: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    feedbackMessage: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  } as SupportPrismaMock;
  prisma.$transaction.mockImplementation((work: (tx: SupportPrismaMock) => unknown) =>
    work(prisma),
  );
  return prisma;
}

describe('SupportService', () => {
  const user = {
    firstName: 'Amina',
    lastName: 'Juma',
    email: 'amina@example.test',
  };
  const submission = {
    id: 'feedback-1',
    category: 'BUG',
    subject: 'Cannot save',
    message: 'Save fails.',
    pagePath: '/dashboard/products',
    status: 'OPEN',
    createdAt: new Date('2026-10-08T07:00:00.000Z'),
    updatedAt: new Date('2026-10-08T07:00:00.000Z'),
  };

  it('creates a feedback record for the authenticated business user', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.feedbackSubmission.create.mockResolvedValue(submission);
    const service = new SupportService(prisma as unknown as PrismaService);

    await service.createFeedback('business-a', 'user-a', {
      category: 'BUG',
      subject: '  Cannot save  ',
      message: '  Save fails.  ',
      pagePath: '/dashboard/products',
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-a', businessId: 'business-a', isActive: true },
      select: { firstName: true, lastName: true, email: true },
    });
    expect(prisma.feedbackSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: 'business-a',
          submittedById: 'user-a',
          submitterName: 'Amina Juma',
          submitterEmail: 'amina@example.test',
          subject: 'Cannot save',
          message: 'Save fails.',
        }),
      }),
    );
    expect(prisma.feedbackMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submissionId: submission.id,
          senderType: 'USER',
          body: 'Save fails.',
        }),
      }),
    );
  });

  it('rejects a submitter who is not an active user in that business', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);
    const service = new SupportService(prisma as unknown as PrismaService);

    await expect(
      service.createFeedback('business-b', 'user-a', {
        category: 'BUG',
        subject: 'Cannot save',
        message: 'Save fails.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.feedbackSubmission.create).not.toHaveBeenCalled();
  });

  it('limits admin inbox updates to the specified business', async () => {
    const prisma = createPrismaMock();
    prisma.feedbackSubmission.updateMany.mockResolvedValue({ count: 1 });
    prisma.feedbackSubmission.findFirstOrThrow.mockResolvedValue({
      ...submission,
      status: 'RESOLVED',
    });
    const service = new SupportService(prisma as unknown as PrismaService);

    await service.updateStatus('business-a', 'feedback-1', { status: 'RESOLVED' });

    expect(prisma.feedbackSubmission.updateMany).toHaveBeenCalledWith({
      where: { id: 'feedback-1', businessId: 'business-a' },
      data: { status: 'RESOLVED' },
    });
  });

  it('adds an admin reply and automatically marks an open conversation in progress', async () => {
    const prisma = createPrismaMock();
    prisma.feedbackSubmission.findFirst.mockResolvedValue(submission);
    prisma.user.findFirst.mockResolvedValue({
      id: 'admin-a',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.test',
      permissions: [],
      userRoles: [{ role: { permissions: [{ key: 'settings.edit' }] } }],
    });
    prisma.feedbackMessage.create.mockResolvedValue({
      id: 'message-2',
      senderType: 'ADMIN',
      senderName: 'Admin User',
      body: 'We are looking into this.',
      createdAt: new Date(),
    });
    const service = new SupportService(prisma as unknown as PrismaService);

    await service.addMessage('business-a', 'admin-a', 'feedback-1', ' We are looking into this. ');

    expect(prisma.feedbackMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderType: 'ADMIN', body: 'We are looking into this.' }),
      }),
    );
    expect(prisma.feedbackSubmission.update).toHaveBeenCalledWith({
      where: { id: 'feedback-1' },
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    });
  });

  it('blocks a different non-admin business user from a feedback thread', async () => {
    const prisma = createPrismaMock();
    prisma.feedbackSubmission.findFirst.mockResolvedValue(submission);
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-b',
      firstName: 'Other',
      lastName: 'User',
      email: 'other@example.test',
      permissions: [],
      userRoles: [],
    });
    const service = new SupportService(prisma as unknown as PrismaService);

    await expect(service.listMessages('business-a', 'user-b', 'feedback-1')).rejects.toThrow(
      'You do not have access to this feedback conversation',
    );
    expect(prisma.feedbackMessage.findMany).not.toHaveBeenCalled();
  });
});
