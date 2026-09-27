import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsEnum,
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
  notes?: string;
}

export class CreatePurchaseReturnDto {
  @IsUUID()
  purchaseOrderId: string;

  @IsOptional()
  @IsString()
  returnNumber?: string;

  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  @ArrayMinSize(1)
  items: PurchaseReturnItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
