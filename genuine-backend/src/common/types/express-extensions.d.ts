import { AuthUser } from './auth-user.type';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: AuthUser;
    }
  }
}
