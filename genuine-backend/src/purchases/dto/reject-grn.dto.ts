import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectGRNDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
