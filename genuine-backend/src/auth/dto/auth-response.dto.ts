export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    businessId: string;
    businessName: string;
    roles: string[];
    permissions: string[];
  };
}
