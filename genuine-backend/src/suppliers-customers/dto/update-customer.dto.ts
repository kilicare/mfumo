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

export class CustomerContactUpdateDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsString()
  position?: string;
}

export class CustomerAddressUpdateDto {
  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['RETAIL', 'WHOLESALE', 'CORPORATE', 'DISTRIBUTOR'])
  customerType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsPhoneNumber()
  secondaryPhone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerAddressUpdateDto)
  address?: CustomerAddressUpdateDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomerContactUpdateDto)
  contacts?: CustomerContactUpdateDto[];

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsEnum(['NET-7', 'NET-14', 'NET-30', 'NET-45', 'NET-60', 'COD', 'PREPAID'])
  paymentTerms?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
