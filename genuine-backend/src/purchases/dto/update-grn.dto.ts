import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsDate,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GRNItemUpdateDto {
  @IsOptional()
  @IsString()
  purchaseOrderItemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acceptedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rejectedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  damageQuantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
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
  vehicleRegistration?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  waybillNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
