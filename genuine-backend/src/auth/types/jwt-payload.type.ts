export type JwtPayload = {
  sub: string;
  email: string;
  businessId: string;
  permissions: string[];
  iat?: number;
  exp?: number;
};

export type JwtPayloadWithRt = JwtPayload & {
  refreshToken: string;
};
