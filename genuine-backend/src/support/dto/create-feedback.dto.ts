import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsIn(['BUG', 'QUESTION', 'IDEA'])
  category: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(120)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pagePath?: string;
}
