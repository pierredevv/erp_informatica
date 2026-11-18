import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  closeCashSchema,
  createItemSchema,
  createSaleSchema,
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  openCashSchema,
  resetPasswordSchema,
  shiftSchema,
  weeklyScheduleSchema,
} from '../packages/shared/src/index';

describe('esquemas compartidos', () => {
  it('acepta correos de intranet y rechaza claves cortas', () => {
    expect(loginSchema.safeParse({ email: 'admin@localhost', password: 'admin123' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'encargado1@localhost', password: 'enc1' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'sin-arroba', password: 'admin123' }).success).toBe(false);
  });

  it('exige clave nueva de al menos 8 caracteres', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'admin123', newPassword: 'corta' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'admin123', newPassword: 'nueva-clave-123' }).success).toBe(true);
  });

  it('solo permite EFECTIVO y QR en ventas', () => {
    const base = { discount: '0', items: [{ itemId: '5f14bd58-6409-4d8f-9ac4-14fd62615d09', quantity: '1' }] };
    expect(createSaleSchema.safeParse({ ...base, method: 'EFECTIVO' }).success).toBe(true);
    expect(createSaleSchema.safeParse({ ...base, method: 'QR' }).success).toBe(true);
    expect(createSaleSchema.safeParse({ ...base, method: 'TARJETA' }).success).toBe(false);
  });

  it('el QR contado es opcional al cerrar caja', () => {
    expect(closeCashSchema.safeParse({ countedCash: '100.00' }).success).toBe(true);
    expect(closeCashSchema.safeParse({ countedCash: '100.00', countedQr: null }).success).toBe(true);
    expect(closeCashSchema.safeParse({ countedCash: '100.00', countedQr: '12.50' }).success).toBe(true);
  });

  it('valida montos decimales para apertura', () => {
    expect(openCashSchema.safeParse({ openingAmount: '0' }).success).toBe(true);
    expect(openCashSchema.safeParse({ openingAmount: '100.001' }).success).toBe(true);
    expect(openCashSchema.safeParse({ openingAmount: '-1' }).success).toBe(false);
  });

  it('valida turnos semanales', () => {
    const userId = '9fea911c-26df-4f88-a507-d701350bb7df';
    expect(shiftSchema.safeParse({ userId, weekday: 1, startTime: '08:00', endTime: '14:00' }).success).toBe(true);
    expect(shiftSchema.safeParse({ userId, weekday: 8, startTime: '08:00', endTime: '14:00' }).success).toBe(false);
    expect(shiftSchema.safeParse({ userId, weekday: 1, startTime: '8:00', endTime: '14:00' }).success).toBe(false);
    expect(weeklyScheduleSchema.safeParse({ userId, shifts: [{ weekday: 2, startTime: '14:00', endTime: '22:30' }] }).success).toBe(true);
  });

  it('exige precio de venta positivo y fechas de usuario válidas', () => {
    expect(createItemSchema.safeParse({ type: 'SERVICIO', name: 'Fotocopia', salePrice: '0' }).success).toBe(false);
    expect(createItemSchema.safeParse({ type: 'SERVICIO', name: 'Fotocopia', salePrice: '2.00' }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: 'Ana', email: 'ana@localhost', role: 'ENCARGADO' }).success).toBe(true);
  });

  it('valida las solicitudes de recuperación de contraseña', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'ana@localhost' }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: 'sin-arroba' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 'abc', newPassword: 'nueva-clave-123' }).success).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature', newPassword: 'corta' }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature', newPassword: 'nueva-clave-123' })
        .success,
    ).toBe(true);
  });
});
