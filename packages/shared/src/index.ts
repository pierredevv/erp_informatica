import { z } from 'zod';

export const TIMEZONE = 'America/La_Paz';
export const CURRENCY = 'BOB';
export const ROLES = ['ADMIN', 'ENCARGADO'] as const;
export const PAYMENT_METHODS = ['EFECTIVO', 'QR'] as const;

const decimal = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Debe ser un número decimal válido')
  .refine((v) => Number(v) >= 0, 'No puede ser negativo');

const positiveDecimal = decimal.refine((v) => Number(v) > 0, 'Debe ser mayor a cero');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:mm');

// Acepta correos de intranet como "admin@localhost", habituales en instalaciones internas.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\s@]+@[^\s@]+$/, 'Correo electrónico inválido');

export const loginSchema = z.object({
  email,
  password: z.string().min(6),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email,
  password: z.string().min(8, 'Mínimo 8 caracteres').optional(),
  role: z.enum(ROLES).default('ENCARGADO'),
  active: z.boolean().default(true),
  sendWelcomeEmail: z.boolean().default(false),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: email.optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

export const shiftSchema = z.object({
  userId: z.string().uuid(),
  weekday: z.number().int().min(1).max(7),
  startTime: hhmm,
  endTime: hhmm,
  active: z.boolean().default(true),
});

export const weeklyScheduleSchema = z.object({
  userId: z.string().uuid(),
  shifts: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      startTime: hhmm,
      endTime: hhmm,
    }),
  ),
});

export const createItemSchema = z.object({
  type: z.enum(['PRODUCTO', 'SERVICIO']),
  sku: z.string().trim().min(1).max(50).optional().nullable(),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1).optional().nullable(),
  salePrice: positiveDecimal,
  lastCost: decimal.optional().nullable(),
  stock: decimal.optional().nullable(),
  minStock: decimal.optional().nullable(),
  reorderQty: decimal.optional().nullable(),
  unit: z.string().trim().max(20).optional().nullable(),
  active: z.boolean().default(true),
});

export const updateItemSchema = createItemSchema.partial();

export const stockAdjustSchema = z.object({
  itemId: z.string().uuid(),
  newStock: decimal,
  note: z.string().trim().min(3),
});

export const stockCountSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().optional().nullable(),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        actualStock: decimal,
      }),
    )
    .min(1),
});

export const saleItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: positiveDecimal,
  unitPrice: positiveDecimal.optional(),
});

export const createSaleSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  discount: decimal.default('0'),
  items: z.array(saleItemSchema).min(1),
  note: z.string().trim().max(500).optional(),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  supplierName: z.string().trim().min(1),
  method: z.enum(PAYMENT_METHODS).default('EFECTIVO'),
  purchasedAt: z.string().datetime().optional(),
  note: z.string().trim().optional().nullable(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: positiveDecimal,
        unitCost: positiveDecimal,
      }),
    )
    .min(1),
});

export const openCashSchema = z.object({
  openingAmount: decimal,
});

export const closeCashSchema = z.object({
  countedCash: decimal,
  countedQr: decimal.optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const reopenCashSchema = z.object({
  reason: z.string().trim().min(5),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2),
  contact: z.string().trim().optional().nullable(),
  active: z.boolean().default(true),
});

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  userId: z.string().uuid().optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type ShiftDto = z.infer<typeof shiftSchema>;
export type CreateItemDto = z.infer<typeof createItemSchema>;
export type CreateSaleDto = z.infer<typeof createSaleSchema>;
export type CreatePurchaseDto = z.infer<typeof createPurchaseSchema>;
export type CloseCashDto = z.infer<typeof closeCashSchema>;
