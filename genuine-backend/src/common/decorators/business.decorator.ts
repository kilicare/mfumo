import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const Business = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const businessId = request.user?.businessId;

  if (!businessId) {
    throw new BadRequestException('Business ID not found in request');
  }

  return businessId;
});
