export const ARCHIVED_EMAIL_PREFIX = 'archived+';

/**
 * Los usuarios desactivados conservan su fila (auditoría, ventas, etc.) pero liberan el correo.
 * El prefijo incluye el id para garantizar unicidad aunque se reutilice el correo original.
 */
export function archivedEmail(email: string, userId: string): string {
  if (email.startsWith(`${ARCHIVED_EMAIL_PREFIX}${userId}+`)) return email;
  return `${ARCHIVED_EMAIL_PREFIX}${userId}+${email}`;
}
