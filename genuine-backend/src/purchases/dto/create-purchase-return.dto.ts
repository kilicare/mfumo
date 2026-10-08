import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsEnum,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseReturnItemDto {
  @IsUUID()
  purchaseOrderItemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsEnum(['DEFECTIVE', 'EXPIRED', 'WRONG_ITEM', 'OVERAGE', 'OTHER'])
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePurchaseReturnDto {
  @IsUUID()
  purchaseOrderId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  returnNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey?: string;

  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  @ArrayMinSize(1)
  items: PurchaseReturnItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
