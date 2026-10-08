import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsDate,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GRNItemDto {
  @IsUUID()
  purchaseOrderItemId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  receivedQuantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  acceptedQuantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rejectedQuantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  damageQuantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class CreateGRNDto {
  @IsUUID()
  purchaseOrderId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  grnNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedDate?: Date;

  @ValidateNested({ each: true })
  @Type(() => GRNItemDto)
  @ArrayMinSize(1)
  items: GRNItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleRegistration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  driverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  waybillNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
