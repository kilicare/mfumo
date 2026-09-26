export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  businessId: string;
  permissions: string[];
  roles: string[];
};
