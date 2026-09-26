import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permissions';
export const ALLOW_ANONYMOUS_KEY = 'allowAnonymous';

export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

export const AllowAnonymous = () => SetMetadata(ALLOW_ANONYMOUS_KEY, true);
