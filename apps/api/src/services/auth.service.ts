import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import type { AuthUser } from '../common/decorators';
import { UsersService } from './users.service';
import { ShiftService } from './shift.service';
import { AuditService } from './audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly shifts: ShiftService,
    private readonly audit: AuditService,
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
}
