import { createHash } from 'node:crypto';
import type { User } from '@prisma/client';
import { config } from './config';

export const PASSWORD_RESET_PURPOSE = 'password-reset';
export const PASSWORD_RESET_TTL = '24h';

export const WELCOME_EMAIL_SUBJECT = 'Tu usuario del sistema está listo';
export const WELCOME_REMINDER_SUBJECT = 'Recordatorio: definí tu contraseña';
export const RESET_EMAIL_SUBJECT = 'Restablece tu contraseña';

export interface PasswordResetPayload {
  sub: string;
  purpose: typeof PASSWORD_RESET_PURPOSE;
  ver: string;
  iat?: number;
  exp?: number;
}

/** La versión cambia con cada passwordHash, lo que invalida todos los enlaces anteriores. */
export function passwordResetVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export function passwordResetPayload(user: Pick<User, 'id' | 'passwordHash'>): PasswordResetPayload {
  return {
    sub: user.id,
    purpose: PASSWORD_RESET_PURPOSE,
    ver: passwordResetVersion(user.passwordHash),
  };
}

export function isPasswordResetPayload(value: unknown): value is PasswordResetPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    payload.purpose === PASSWORD_RESET_PURPOSE &&
    typeof payload.ver === 'string'
  );
}

/** La ruta se codifica para que ningún cliente de correo trate la `ñ` como carácter especial. */
export function passwordResetLink(token: string): string {
  const base = config.appUrl.replace(/\/+$/, '');
  return `${base}/cambiar-contrase%C3%B1a?token=${encodeURIComponent(token)}`;
}

export function passwordResetEmailBody(name: string, link: string): string {
  return [
    `Hola ${name}.`,
    '',
    'Recibimos una solicitud para definir o cambiar la contraseña de tu usuario.',
    `Ingresá al siguiente enlace para elegir tu contraseña: ${link}`,
    '',
    'El enlace vence en 24 horas y deja de ser válido una vez que la contraseña sea cambiada.',
    'Si no fuiste vos, podés ignorar este correo.',
  ].join('\n');
}

export function welcomeEmailBody(name: string, email: string, link: string): string {
  return [
    `Hola ${name}.`,
    '',
    `Tu usuario es ${email}.`,
    `Para definir tu contraseña, ingresá al siguiente enlace: ${link}`,
    '',
    'El enlace vence en 24 horas. Si no fuiste vos, podés ignorar este correo.',
  ].join('\n');
}

export function welcomeReminderEmailBody(name: string, email: string, link: string): string {
  return [
    `Hola ${name}.`,
    '',
    'Recordatorio: tu usuario del sistema todavía no tiene contraseña definida.',
    `Tu usuario es ${email}.`,
    `Para definir tu contraseña, ingresá al siguiente enlace: ${link}`,
    '',
    'El enlace vence en 24 horas. Una vez que definas la clave, este aviso deja de enviarse.',
    'Si no fuiste vos, podés ignorar este correo.',
  ].join('\n');
}
