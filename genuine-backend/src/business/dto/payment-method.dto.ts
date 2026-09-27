import { IsString, IsOptional } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class PaymentMethodResponseDto {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
}
