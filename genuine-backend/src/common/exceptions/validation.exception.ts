import { BadRequestException } from '@nestjs/common';

export class PayloadValidationException extends BadRequestException {
  constructor(errors: Record<string, string[]>) {
    super({
      statusCode: 400,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}
