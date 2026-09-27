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

export class CustomerContactDto {
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

export class CustomerAddressDto {
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

export class CreateCustomerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsEnum(['RETAIL', 'WHOLESALE', 'CORPORATE', 'DISTRIBUTOR'])
  customerType: string;

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
  @Type(() => CustomerAddressDto)
  address?: CustomerAddressDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomerContactDto)
  contacts?: CustomerContactDto[];

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsNumber()
  @Min(0)
  creditLimit: number;

  @IsEnum(['NET-7', 'NET-14', 'NET-30', 'NET-45', 'NET-60', 'COD', 'PREPAID'])
  paymentTerms: string;

  @IsNumber()
  @Min(0)
  openingBalance: number;

  @IsBoolean()
  isActive: boolean;
}
