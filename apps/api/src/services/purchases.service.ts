import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentMethod, Purchase } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';
import { CashService } from './cash.service';
import { AlertsService } from './alerts.service';

export interface PurchaseLineInput {
  itemId: string;
  quantity: string;
  unitCost: string;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cash: CashService,
    private readonly alerts: AlertsService,
  ) {}

  async create(
    user: AuthUser,
    input: {
      supplierId?: string | null;
      supplierName: string;
      method: PaymentMethod;
      purchasedAt?: string;
      note?: string | null;
      items: PurchaseLineInput[];
    },
  ): Promise<Purchase> {
    await this.cash.assertUserCanOperate(await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
    const session = await this.cash.requireOpen();

    const ids = input.items.map((line) => line.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: ids } } });
    const byId = new Map(items.map((item) => [item.id, item]));
    const lines = input.items.map((line) => {
      const item = byId.get(line.itemId);
      if (!item) throw new NotFoundException(`Item ${line.itemId} no encontrado`);
      if (item.type !== 'PRODUCTO') throw new BadRequestException(`No se puede comprar el servicio ${item.name}`);
      return { item, ...line, subtotal: Math.round(Number(line.quantity) * Number(line.unitCost) * 100) / 100 };
    });
    const total = Math.round(lines.reduce((sum, line) => sum + line.subtotal, 0) * 100) / 100;

    const purchase = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          supplierId: input.supplierId ?? null,
          supplierName: input.supplierName,
          sessionId: session.id,
          createdById: user.id,
          purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : new Date(),
          total,
          method: input.method,
          note: input.note ?? null,
        },
      });

      for (const line of lines) {
        await tx.purchaseItem.create({
          data: {
            purchaseId: created.id,
            itemId: line.itemId,
            nameSnapshot: line.item.name,
            quantity: line.quantity,
            unitCost: line.unitCost,
            subtotal: line.subtotal,
          },
        });
        await tx.item.update({
          where: { id: line.itemId },
          data: {
            stock: { increment: Number(line.quantity) },
            lastCost: line.unitCost,
          },
        });
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            type: 'COMPRA',
            delta: Number(line.quantity),
            purchaseId: created.id,
            createdById: user.id,
            note: `Compra a ${input.supplierName}`,
          },
        });
      }

      await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          type: 'COMPRA',
          direction: 'OUT',
          method: input.method,
          amount: total,
          description: `Compra a ${input.supplierName}`,
          purchaseId: created.id,
          createdById: user.id,
        },
      });

      await this.audit.log(
        {
          action: 'PURCHASE_CREATE',
          entity: 'Purchase',
          entityId: created.id,
          after: {
            supplier: input.supplierName,
            total,
            method: input.method,
            items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost })),
          },
          user,
        },
        tx,
      );
      return created;
    });
    return purchase;
  }

  async list(filters: { from?: string; to?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.from || filters.to) {
      const purchasedAt: Record<string, Date> = {};
      if (filters.from) purchasedAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
      if (filters.to) purchasedAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
      where.purchasedAt = purchasedAt;
    }
    return this.prisma.purchase.findMany({
      where: where as never,
      include: {
        items: true,
        createdBy: { select: { name: true } },
        session: { select: { businessDate: true } },
      },
      orderBy: { purchasedAt: 'desc' },
      take: 500,
    });
  }

  async findById(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { items: true, createdBy: { select: { name: true } }, movements: true },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return purchase;
  }

  async suppliers() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async createSupplier(data: { name: string; contact?: string | null; active: boolean }, user: AuthUser) {
    const supplier = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({ data });
      await this.audit.log(
        { action: 'SUPPLIER_CREATE', entity: 'Supplier', entityId: created.id, after: data, user },
        tx,
      );
      return created;
    });
    return supplier;
  }
}
