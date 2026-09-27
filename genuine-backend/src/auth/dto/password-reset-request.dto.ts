export class PasswordResetRequestDto {
  message: string;
  email: string;
  resetToken?: string;
}

