import {
  IsString,
  IsEmail,
  IsPhoneNumber,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SupplierContactDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsPhoneNumber()
  phone: string;

  @IsOptional()
  @IsString()
  position?: string;
}

export class SupplierAddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  region: string;

  @IsString()
  postalCode: string;

  @IsOptional()
  @IsString()
  country?: string;
}

export class CreateSupplierDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  supplierCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEmail()
  email: string;

  @IsPhoneNumber()
  phone: string;

  @IsOptional()
  @IsPhoneNumber()
  secondaryPhone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SupplierAddressDto)
  address?: SupplierAddressDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SupplierContactDto)
  contacts?: SupplierContactDto[];

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankSwiftCode?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsEnum(['NET-7', 'NET-14', 'NET-30', 'NET-45', 'NET-60', 'CASH'])
  paymentTerms: string;

  @IsNumber()
  @Min(0)
  openingBalance: number;

  @IsBoolean()
  isActive: boolean;
}
