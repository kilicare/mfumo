import { IsString, IsOptional } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ExpenseCategoryResponseDto {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
}
