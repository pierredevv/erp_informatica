import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ALLOW_OUT_OF_SHIFT_KEY, IS_PUBLIC_KEY, ROLES_KEY, AuthUser } from './decorators';
import { ShiftService } from '../services/shift.service';

interface RequestWithUser {
  cookies?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  user?: AuthUser;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;

    const cookieToken = req.cookies?.erp_csrf;
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Token CSRF inválido');
    }
    return true;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = req.cookies?.erp_token;
    if (!token) throw new UnauthorizedException('No autenticado');

    try {
      req.user = this.jwt.verify<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Array<'ADMIN' | 'ENCARGADO'>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenException('No tenés permisos para esta operación');
    }
    return true;
  }
}

@Injectable()
export class ShiftGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly shiftService: ShiftService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_OUT_OF_SHIFT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || allowed) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (!req.user) return true;

    const inShift = await this.shiftService.isInShift(req.user.id);
    if (!inShift) {
      throw new ForbiddenException({
        message: 'Fuera de tu horario asignado',
        code: 'OUT_OF_SHIFT',
      });
    }
    return true;
  }
}
