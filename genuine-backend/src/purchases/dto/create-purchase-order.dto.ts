import {
  IsString,
  IsNumber,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
  IsDate,
  Max,
  MaxLength,
  IsNotEmpty,
  IsUUID,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'maxDecimalPlaces', async: false })
class MaxDecimalPlacesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value)) return true;
    const maxPlaces = Number(args.constraints[0]);
    const [coefficient, exponentValue] = value.toString().toLowerCase().split('e');
    const decimalPlaces = Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponentValue ?? 0));
    return decimalPlaces <= maxPlaces;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must have no more than ${args.constraints[0]} decimal places`;
  }
}

@ValidatorConstraint({ name: 'discountWithinGrossAmount', async: false })
class DiscountWithinGrossAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value === undefined || value === null) return true;
    const item = args.object as { quantity?: number; unitPrice?: number };
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const discount = Number(value);
    if (![quantity, unitPrice, discount].every(Number.isFinite)) return true;
    return discount <= quantity * unitPrice;
  }

  defaultMessage(): string {
    return 'Item discount cannot exceed its gross amount';
  }
}

@ValidatorConstraint({ name: 'exclusivePurchaseTaxInputs', async: false })
class ExclusivePurchaseTaxInputsConstraint implements ValidatorConstraintInterface {
  validate(_taxAmount: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { taxPercentage?: number };
    return dto.taxPercentage === undefined;
  }

  defaultMessage(): string {
    return 'Provide either taxAmount or taxPercentage, not both';
  }
}

@ValidatorConstraint({ name: 'expectedDeliveryNotBeforeOrderDate', async: false })
class ExpectedDeliveryNotBeforeOrderDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { orderDate?: Date };
    if (!(value instanceof Date) || Number.isNaN(value.getTime()) || !dto.orderDate || Number.isNaN(dto.orderDate.getTime())) return true;
    const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return day(value) >= day(dto.orderDate);
  }

  defaultMessage(): string {
    return 'Expected delivery date cannot be earlier than the order date';
  }
}

export class PurchaseOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Validate(MaxDecimalPlacesConstraint, [2])
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(MaxDecimalPlacesConstraint, [2])
  unitPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(MaxDecimalPlacesConstraint, [2])
  @Validate(DiscountWithinGrossAmountConstraint)
  discount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  poNumber?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  orderDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @Validate(ExpectedDeliveryNotBeforeOrderDateConstraint)
  expectedDeliveryDate?: Date;

  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  @ArrayMinSize(1)
  items: PurchaseOrderItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(MaxDecimalPlacesConstraint, [2])
  shippingCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(MaxDecimalPlacesConstraint, [2])
  @Validate(ExclusivePurchaseTaxInputsConstraint)
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @Validate(MaxDecimalPlacesConstraint, [2])
  taxPercentage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;
}
