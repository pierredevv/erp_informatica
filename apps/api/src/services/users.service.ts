import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Role, User } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/decorators';
import { config } from '../common/config';
import {
  PASSWORD_RESET_TTL,
  passwordResetLink,
  passwordResetPayload,
  welcomeEmailBody,
  passwordResetEmailBody,
} from '../common/password-reset';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';
import { archivedEmail } from '../common/user-email';

export type SafeUser = Omit<User, 'passwordHash'>;

export interface ResetPasswordResult {
  message: string;
  emailSent: boolean;
  temporaryPassword?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
  ) {}

  async list(includeInactive = false): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      where: includeInactive ? undefined : { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        mustChangePassword: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    // Los usuarios eliminados tienen el correo archivado; nunca deben bloquear uno nuevo.
    return this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
    });
  }

  /** Token de un solo uso: queda invalidado cuando cambia el passwordHash. */
  passwordResetToken(user: Pick<User, 'id' | 'passwordHash'>): string {
    return this.jwt.sign(passwordResetPayload(user), { expiresIn: PASSWORD_RESET_TTL });
  }

  async create(
    data: { name: string; email: string; password?: string; role: Role; active: boolean; sendWelcomeEmail?: boolean },
    actor: AuthUser,
  ): Promise<SafeUser> {
    const exists = await this.findByEmail(data.email);
    if (exists) throw new BadRequestException('Ya existe un usuario con ese correo');
    const plain = data.password || randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(plain, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email.trim().toLowerCase(),
          passwordHash,
          role: data.role,
          active: data.active,
          mustChangePassword: true,
        },
      });
      await this.audit.log(
        { action: 'USER_CREATE', entity: 'User', entityId: created.id, after: { email: created.email, role: created.role }, user: actor },
        tx,
      );
      return created;
    });

    if (data.sendWelcomeEmail) {
      const link = passwordResetLink(this.passwordResetToken(user));
      await this.mail.enqueue(
        user.email,
        'Tu usuario del sistema está listo',
        welcomeEmailBody(user.name, user.email, link),
      );
    }
    return this.toSafe(user);
  }

  async update(id: string, data: Partial<{ name: string; email: string; role: Role; active: boolean }>, actor: AuthUser): Promise<SafeUser> {
    const previous = await this.findById(id);
    const normalizedEmail = data.email?.trim().toLowerCase();
    if (normalizedEmail && normalizedEmail !== previous.email) {
      const other = await this.findByEmail(normalizedEmail);
      if (other && other.id !== id) throw new BadRequestException('Ya existe un usuario con ese correo');
    }
    if (previous.role === 'ADMIN' && (data.role === 'ENCARGADO' || data.active === false)) {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN', active: true, deletedAt: null } });
      if (admins <= 1) throw new BadRequestException('No puede desactivar o degradar al único administrador');
    }
    const deactivating = data.active === false;
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...data,
          ...(normalizedEmail !== undefined
            ? { email: deactivating ? archivedEmail(normalizedEmail, id) : normalizedEmail }
            : deactivating
              ? { email: archivedEmail(previous.email, id) }
              : {}),
          ...(deactivating ? { deletedAt: new Date() } : {}),
        },
      });
      if (deactivating) {
        await tx.shiftTemplate.updateMany({ where: { userId: id }, data: { active: false } });
      }
      await this.audit.log(
        {
          action: deactivating ? 'USER_DEACTIVATE' : 'USER_UPDATE',
          entity: 'User',
          entityId: id,
          before: { name: previous.name, email: previous.email, role: previous.role, active: previous.active },
          after: { name: updated.name, email: updated.email, role: updated.role, active: updated.active },
          user: actor,
        },
        tx,
      );
      return updated;
    });
    return this.toSafe(user);
  }

  async deactivate(id: string, actor: AuthUser): Promise<SafeUser> {
    const previous = await this.findById(id);
    if (previous.role === 'ADMIN') {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN', active: true, deletedAt: null } });
      if (admins <= 1) throw new BadRequestException('No puede eliminar al único administrador');
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { active: false, deletedAt: new Date(), email: archivedEmail(previous.email, id) },
      });
      await tx.shiftTemplate.updateMany({ where: { userId: id }, data: { active: false } });
      await this.audit.log({ action: 'USER_DEACTIVATE', entity: 'User', entityId: id, user: actor }, tx);
      return updated;
    });
    return this.toSafe(user);
  }

  async resetPassword(id: string, actor: AuthUser): Promise<ResetPasswordResult> {
    const user = await this.findById(id);
    // Rotar el hash invalida los enlaces enviados anteriormente.
    const temporaryPassword = randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      });
      await this.audit.log({ action: 'USER_PASSWORD_RESET', entity: 'User', entityId: id, user: actor }, tx);
      return result;
    });

    const emailSent = config.mailConfigured;
    const link = passwordResetLink(this.passwordResetToken(updated));
    await this.mail.enqueue(
      updated.email,
      'Restablece tu contraseña',
      passwordResetEmailBody(updated.name, link),
    );
    return {
      message: emailSent
        ? `Se envió un enlace a ${updated.email} para definir la contraseña.`
        : `No hay correo configurado. Entregá esta contraseña temporal a ${updated.email}: ${temporaryPassword}`,
      emailSent,
      ...(emailSent ? {} : { temporaryPassword }),
    };
  }

  /**
   * Reenvía el correo de creación a los usuarios activos que todavía no definieron su clave.
   * No duplica si ya hay un envío pendiente/en curso para el mismo correo.
   */
  async resendWelcomeToPending(actor: AuthUser): Promise<{ sent: number; skipped: number; total: number }> {
    const users = await this.prisma.user.findMany({
      where: { active: true, deletedAt: null, mustChangePassword: true },
      orderBy: { createdAt: 'asc' },
    });
    const subject = 'Tu usuario del sistema está listo';
    let sent = 0;
    let skipped = 0;

    for (const user of users) {
      const pending = await this.prisma.emailOutbox.count({
        where: { toAddress: user.email, subject, status: { in: ['PENDING', 'PROCESSING'] } },
      });
      if (pending > 0) {
        skipped += 1;
        continue;
      }
      const link = passwordResetLink(this.passwordResetToken(user));
      await this.mail.enqueue(user.email, subject, welcomeEmailBody(user.name, user.email, link));
      await this.audit.log({ action: 'USER_WELCOME_RESEND', entity: 'User', entityId: user.id, user: actor });
      sent += 1;
    }
    return { sent, skipped, total: users.length };
  }

  /** Cambia la clave cuando el usuario proviene de un enlace de recuperación válido. */
  async setPasswordFromLink(userId: string, newPassword: string): Promise<void> {
    await this.saveNewPassword(userId, newPassword);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('La contraseña actual es incorrecta');
    await this.saveNewPassword(userId, newPassword);
  }

  private async saveNewPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
      await this.audit.log({ action: 'USER_PASSWORD_CHANGE', entity: 'User', entityId: userId }, tx);
    });
  }

  private toSafe(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
