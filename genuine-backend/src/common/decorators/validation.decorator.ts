import { SetMetadata } from '@nestjs/common';

export const VALIDATE_KEY = 'validate';

export const ValidatePayload = (schema: any) => SetMetadata(VALIDATE_KEY, schema);
