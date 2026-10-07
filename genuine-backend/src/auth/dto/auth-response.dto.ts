export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    businessId: string;
    businessName: string;
    roles: string[];
    permissions: string[];
  };
}
