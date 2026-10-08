import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsDate,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GRNItemUpdateDto {
  @IsOptional()
  @IsString()
  purchaseOrderItemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  receivedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  acceptedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rejectedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  damageQuantity?: number;

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

export class UpdateGRNDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedDate?: Date;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GRNItemUpdateDto)
  @IsArray()
  items?: GRNItemUpdateDto[];

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
