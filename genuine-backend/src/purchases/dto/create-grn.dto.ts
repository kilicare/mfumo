import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GRNItemDto {
  @IsUUID()
  purchaseOrderItemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acceptedQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rejectedQuantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  damageQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateGRNDto {
  @IsUUID()
  purchaseOrderId: string;

  @IsOptional()
  @IsString()
  grnNumber?: string;

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
