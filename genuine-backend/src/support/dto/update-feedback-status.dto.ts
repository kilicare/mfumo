import { IsIn } from 'class-validator';

export class UpdateFeedbackStatusDto {
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED'])
  status: string;
}
