import { IsString, MaxLength, Matches } from 'class-validator';

export class UpdateAvatarDto {
  @IsString()
  @MaxLength(90_000)
  @Matches(/^$|^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/)
  avatar: string;
}
