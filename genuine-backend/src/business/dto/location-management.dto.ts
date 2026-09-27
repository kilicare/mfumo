import { IsString, IsEnum, IsOptional } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(['WAREHOUSE', 'SHOP', 'BRANCH', 'DEPOT'])
  type?: 'WAREHOUSE' | 'SHOP' | 'BRANCH' | 'DEPOT';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(['WAREHOUSE', 'SHOP', 'BRANCH', 'DEPOT'])
  type?: 'WAREHOUSE' | 'SHOP' | 'BRANCH' | 'DEPOT';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class LocationResponseDto {
  id: string;
  businessId: string;
  name: string;
  code: string;
  type: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
