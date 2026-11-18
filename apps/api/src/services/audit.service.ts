import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/decorators';

type Db = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  user?: AuthUser | null;
  ip?: string | null;
  userAgent?: string | null;
}

function toJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  // Prisma serializa Decimal como número al guardarlo en columnas Json.
  if (value instanceof Prisma.Decimal) return value.toNumber();

  if (typeof value === 'object') {
    const candidate = value as { toJSON?: () => unknown };
    if (typeof candidate.toJSON === 'function') return toJsonValue(candidate.toJSON());
    if (Array.isArray(value)) return value.map(toJsonValue);

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = toJsonValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  return value;
}

function stableStringify(value: unknown): string {
  const normalized = toJsonValue(value);
  if (normalized === null) return 'null';
  if (Array.isArray(normalized)) return `[${normalized.map(stableStringify).join(',')}]`;
  if (typeof normalized === 'object') {
    const obj = normalized as Record<string, unknown>;
    return `{${Object.keys(obj)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(normalized);
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<AuditLog> {
    if (!tx) {
      return this.prisma.$transaction((transaction) => this.write(transaction, entry));
    }
    return this.write(tx, entry);
  }

  private async write(db: Db, entry: AuditEntry): Promise<AuditLog> {
    await db.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('erp_audit_chain'))`);
    const previous = await db.auditLog.findFirst({ orderBy: { sequence: 'desc' } });
    const prevHash = previous?.hash ?? 'GENESIS';
    const payload = {
      prevHash,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? null,
      actorId: entry.user?.id ?? null,
      actorRole: entry.user?.role ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    };
    const hash = createHash('sha256').update(prevHash + stableStringify(payload)).digest('hex');
    return db.auditLog.create({
      data: {
        prevHash,
        hash,
        actorId: payload.actorId,
        actorRole: payload.actorRole,
        action: payload.action,
        entity: payload.entity,
        entityId: payload.entityId,
        before: payload.before as Prisma.InputJsonValue,
        after: payload.after as Prisma.InputJsonValue,
        reason: payload.reason,
        ip: payload.ip,
        userAgent: payload.userAgent,
      },
    });
  }

  async list(limit = 200): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({ orderBy: { sequence: 'desc' }, take: limit });
  }

  async verify(): Promise<{ valid: boolean; count: number; firstInvalidSequence?: bigint }> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { sequence: 'asc' } });
    let prevHash = 'GENESIS';
    for (const row of rows) {
      const payload = {
        prevHash,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        reason: row.reason,
        actorId: row.actorId,
        actorRole: row.actorRole,
        ip: row.ip,
        userAgent: row.userAgent,
      };
      const expected = createHash('sha256')
        .update(prevHash + stableStringify(payload))
        .digest('hex');
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { valid: false, count: rows.length, firstInvalidSequence: row.sequence };
      }
      prevHash = row.hash;
    }
    return { valid: true, count: rows.length };
  }
}
