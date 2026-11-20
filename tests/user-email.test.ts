import { describe, expect, it } from 'vitest';
import { archivedEmail } from '../apps/api/src/common/user-email';

describe('liberación de correo al desactivar usuarios', () => {
  it('archiva el correo con el id para mantener la unicidad', () => {
    expect(archivedEmail('ruiz.mgl.lyz@gmail.com', 'user-123')).toBe(
      'archived+user-123+ruiz.mgl.lyz@gmail.com',
    );
  });

  it('es idempotente', () => {
    const once = archivedEmail('ruiz.mgl.lyz@gmail.com', 'user-123');
    expect(archivedEmail(once, 'user-123')).toBe(once);
  });

  it('distingue usuarios distintos con el mismo correo original', () => {
    const first = archivedEmail('juan@gmail.com', 'user-1');
    const second = archivedEmail('juan@gmail.com', 'user-2');
    expect(first).not.toBe(second);
    expect(second).toContain('user-2');
  });
});
