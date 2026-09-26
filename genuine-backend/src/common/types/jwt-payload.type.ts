export type JwtPayload = {
  sub: string; // User ID
  email: string;
  businessId: string;
  permissions: string[];
  iat?: number;
  exp?: number;
};
