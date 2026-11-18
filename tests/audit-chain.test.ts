import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AuditService } from '../apps/api/src/services/audit.service';

class FakePrisma {
  rows: any[] = [];

  async $executeRawUnsafe(): Promise<number> {
    return 0;
  }

  async $transaction<T>(fn: (tx: this) => Promise<T> | T): Promise<T> {
    return fn(this);
  }

  auditLog = {
    findFirst: async ({ orderBy }: { orderBy: { sequence: string } }) => {
      const direction = orderBy.sequence === 'desc' ? -1 : 1;
      const sorted = [...this.rows].sort((a, b) => direction * (Number(a.sequence) - Number(b.sequence)));
      return sorted[0] ?? null;
    },
    findMany: async ({ orderBy }: { orderBy: { sequence: string } }) => {
      const direction = orderBy.sequence === 'desc' ? -1 : 1;
      return [...this.rows].sort((a, b) => direction * (Number(a.sequence) - Number(b.sequence)));
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { ...data, sequence: BigInt(this.rows.length + 1), createdAt: new Date() };
      this.rows.push(row);
      return row;
    },
  };
}

const actor = { id: 'user-1', name: 'Admin', email: 'admin@localhost', role: 'ADMIN' as const };

describe('cadena de auditoría inmutable', () => {
  it('encadena los eventos y detecta modificaciones', async () => {
    const prisma = new FakePrisma();
    const audit = new AuditService(prisma as never);

    await audit.log({ action: 'CASH_OPEN', entity: 'CashSession', entityId: 's1', after: { amount: '100' }, user: actor });
    await audit.log({
      action: 'SALE_CREATE',
      entity: 'Sale',
      entityId: 'v1',
      before: null,
      after: { total: '25', items: [{ qty: 1, price: 25 }] },
      user: actor,
    });

    expect(prisma.rows).toHaveLength(2);
    expect(prisma.rows[0].prevHash).toBe('GENESIS');
    expect(prisma.rows[1].prevHash).toBe(prisma.rows[0].hash);
    expect(await audit.verify()).toMatchObject({ valid: true, count: 2 });

    prisma.rows[1].after = { total: '26', items: [{ qty: 1, price: 26 }] };
    const result = await audit.verify();
    expect(result.valid).toBe(false);
    expect(String(result.firstInvalidSequence)).toBe('2');
  });

  it('produce hashes estables sin importar el orden de las claves', async () => {
    const prisma = new FakePrisma();
    const audit = new AuditService(prisma as never);

    await audit.log({ action: 'A', entity: 'X', after: { a: 1, b: 2 } });
    const first = prisma.rows[0].hash;

    const other = new FakePrisma();
    const otherAudit = new AuditService(other as never);
    await otherAudit.log({ action: 'A', entity: 'X', after: { b: 2, a: 1 } });

    expect(other.rows[0].hash).toBe(first);
  });

  it('normaliza Decimal y Date antes de calcular el hash', async () => {
    const at = new Date('2026-11-17T12:00:00.000Z');
    const prisma = new FakePrisma();
    const audit = new AuditService(prisma as never);

    await audit.log({
      action: 'ITEM_UPDATE',
      entity: 'Item',
      after: { price: new Prisma.Decimal('1.50'), at },
    });

    const other = new FakePrisma();
    const otherAudit = new AuditService(other as never);
    await otherAudit.log({
      action: 'ITEM_UPDATE',
      entity: 'Item',
      after: { price: 1.5, at: at.toISOString() },
    });

    expect(other.rows[0].hash).toBe(prisma.rows[0].hash);
    expect(await audit.verify()).toMatchObject({ valid: true, count: 1 });
  });
});
