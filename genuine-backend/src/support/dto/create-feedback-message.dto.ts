import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateFeedbackMessageDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(5000)
  body: string;
}
