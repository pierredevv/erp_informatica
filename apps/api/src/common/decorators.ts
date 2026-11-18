import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'ADMIN' | 'ENCARGADO'>) => SetMetadata(ROLES_KEY, roles);

export const ALLOW_OUT_OF_SHIFT_KEY = 'allowOutOfShift';
export const AllowOutOfShift = () => SetMetadata(ALLOW_OUT_OF_SHIFT_KEY, true);

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'ENCARGADO';
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
