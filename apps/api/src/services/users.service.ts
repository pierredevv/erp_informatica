import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Role, User } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';

export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
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
    return this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
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
      await this.mail.enqueue(
        user.email,
        'Tu usuario del sistema está listo',
        `Hola ${user.name}. Tu usuario es ${user.email} y tu contraseña temporal es ${plain}. Deberás cambiarla al ingresar.`,
      );
    }
    return this.toSafe(user);
  }

  async update(id: string, data: Partial<{ name: string; email: string; role: Role; active: boolean }>, actor: AuthUser): Promise<SafeUser> {
    const previous = await this.findById(id);
    if (data.email && data.email !== previous.email) {
      const other = await this.findByEmail(data.email);
      if (other && other.id !== id) throw new BadRequestException('Ya existe un usuario con ese correo');
    }
    if (previous.role === 'ADMIN' && (data.role === 'ENCARGADO' || data.active === false)) {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN', active: true, deletedAt: null } });
      if (admins <= 1) throw new BadRequestException('No puede desactivar o degradar al único administrador');
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { ...data, email: data.email?.trim().toLowerCase() },
      });
      await this.audit.log(
        {
          action: 'USER_UPDATE',
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
        data: { active: false, deletedAt: new Date() },
      });
      await tx.shiftTemplate.updateMany({ where: { userId: id }, data: { active: false } });
      await this.audit.log({ action: 'USER_DEACTIVATE', entity: 'User', entityId: id, user: actor }, tx);
      return updated;
    });
    return this.toSafe(user);
  }

  async resetPassword(id: string, actor: AuthUser): Promise<{ temporaryPassword: string }> {
    const user = await this.findById(id);
    const temporaryPassword = randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      });
      await this.audit.log({ action: 'USER_PASSWORD_RESET', entity: 'User', entityId: id, user: actor }, tx);
    });
    await this.mail.enqueue(
      user.email,
      'Restablecimiento de contraseña',
      `Tu contraseña temporal es ${temporaryPassword}. Deberás cambiarla al ingresar.`,
    );
    return { temporaryPassword };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('La contraseña actual es incorrecta');
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
