import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import type { AuthUser } from '../common/decorators';
import {
  isPasswordResetPayload,
  passwordResetEmailBody,
  passwordResetLink,
  passwordResetVersion,
  type PasswordResetPayload,
} from '../common/password-reset';
import { UsersService } from './users.service';
import { ShiftService } from './shift.service';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';

const INVALID_LINK_MESSAGE = 'El enlace no es válido o venció. Solicitá uno nuevo.';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly shifts: ShiftService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async validate(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.active || user.deletedAt) throw new UnauthorizedException('Credenciales inválidas');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');
    if (user.role === 'ENCARGADO') {
      const inShift = await this.shifts.isInShift(user.id);
      if (!inShift) {
        await this.audit.log({
          action: 'LOGIN_OUT_OF_SHIFT',
          entity: 'User',
          entityId: user.id,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
        throw new UnauthorizedException({
          message: 'Fuera de tu horario asignado',
          code: 'OUT_OF_SHIFT',
        });
      }
    }
    return user;
  }

  tokenFor(user: User): string {
    const payload: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    return this.jwt.sign(payload);
  }

  csrfToken(): string {
    return randomBytes(24).toString('hex');
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      shift: await this.shifts.currentInfo(user.id),
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new BadRequestException('La contraseña nueva debe tener al menos 8 caracteres');
    await this.users.changePassword(userId, currentPassword, newPassword);
  }

  /** Siempre responde lo mismo para no revelar qué correos están registrados. */
  async requestPasswordReset(email: string): Promise<{ ok: true }> {
    const user = await this.users.findByEmail(email);
    if (user && user.active && !user.deletedAt) {
      const link = passwordResetLink(this.users.passwordResetToken(user));
      await this.mail.enqueue(user.email, 'Restablece tu contraseña', passwordResetEmailBody(user.name, link));
      await this.audit.log({
        action: 'PASSWORD_RESET_REQUESTED',
        entity: 'User',
        entityId: user.id,
      });
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    let payload: PasswordResetPayload;
    try {
      const decoded = this.jwt.verify<Record<string, unknown>>(token);
      if (!isPasswordResetPayload(decoded)) throw new Error('Payload inválido');
      payload = decoded;
    } catch {
      throw new UnauthorizedException(INVALID_LINK_MESSAGE);
    }

    let user: User;
    try {
      user = await this.users.findById(payload.sub);
    } catch {
      throw new UnauthorizedException(INVALID_LINK_MESSAGE);
    }
    if (!user.active || user.deletedAt) throw new UnauthorizedException(INVALID_LINK_MESSAGE);
    if (passwordResetVersion(user.passwordHash) !== payload.ver) {
      throw new UnauthorizedException('El enlace ya fue utilizado. Solicitá uno nuevo.');
    }
    if (newPassword.length < 8) throw new BadRequestException('La contraseña nueva debe tener al menos 8 caracteres');

    await this.users.setPasswordFromLink(user.id, newPassword);
    return { ok: true };
  }
}
