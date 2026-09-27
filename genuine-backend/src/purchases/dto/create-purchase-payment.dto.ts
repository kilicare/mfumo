import { IsDate, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchasePaymentDto {
  @IsOptional()
  @IsString()
  paymentNumber?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(Number.MAX_SAFE_INTEGER)
  amount: number;

  @IsString()
  paymentMethodId: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paymentDate?: Date;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
