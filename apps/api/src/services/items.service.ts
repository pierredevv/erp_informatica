import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Item } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';
import { AlertsService } from './alerts.service';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alerts: AlertsService,
  ) {}

  async list(includeInactive = false): Promise<Item[]> {
    return this.prisma.item.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<Item> {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Producto o servicio no encontrado');
    return item;
  }

  async create(data: Record<string, unknown>, user: AuthUser): Promise<Item> {
    const payload = this.clean(data);
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.item.create({ data: payload as never });
      await this.audit.log(
        { action: 'ITEM_CREATE', entity: 'Item', entityId: created.id, after: payload, user },
        tx,
      );
      return created;
    });
    await this.alerts.check([item.id]);
    return item;
  }

  async update(id: string, data: Record<string, unknown>, user: AuthUser): Promise<Item> {
    const previous = await this.findById(id);
    const payload = this.clean(data);
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({ where: { id }, data: payload as never });
      await this.audit.log(
        { action: 'ITEM_UPDATE', entity: 'Item', entityId: id, before: previous, after: updated, user },
        tx,
      );
      return updated;
    });
    await this.alerts.check([item.id]);
    return item;
  }

  async deactivate(id: string, user: AuthUser): Promise<Item> {
    const previous = await this.findById(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({ where: { id }, data: { active: false } });
      await this.audit.log(
        { action: 'ITEM_DEACTIVATE', entity: 'Item', entityId: id, before: { active: previous.active }, after: { active: false }, user },
        tx,
      );
      return updated;
    });
  }

  async adjustStock(
    itemId: string,
    newStock: string,
    note: string,
    user: AuthUser,
  ): Promise<Item> {
    const item = await this.findById(itemId);
    if (item.type === 'SERVICIO') throw new BadRequestException('Los servicios no tienen stock');
    const delta = Number(newStock) - Number(item.stock ?? 0);
    if (delta === 0) return item;

    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.item.update({ where: { id: itemId }, data: { stock: newStock } });
      await tx.stockMovement.create({
        data: {
          itemId,
          type: 'AJUSTE',
          delta,
          note,
          createdById: user.id,
        },
      });
      await this.audit.log(
        {
          action: 'STOCK_ADJUST',
          entity: 'Item',
          entityId: itemId,
          before: { stock: item.stock },
          after: { stock: newStock, note },
          user,
        },
        tx,
      );
      return changed;
    });
    await this.alerts.check([itemId]);
    return updated;
  }

  async createStockCount(
    businessDate: string,
    note: string | null | undefined,
    lines: Array<{ itemId: string; actualStock: string }>,
    user: AuthUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.create({
        data: {
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          countedById: user.id,
          note: note ?? null,
        },
      });
      for (const line of lines) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (!item) throw new NotFoundException('Item no encontrado en el conteo');
        const expected = Number(item.stock ?? 0);
        const actual = Number(line.actualStock);
        await tx.stockCountLine.create({
          data: {
            countId: count.id,
            itemId: line.itemId,
            expectedStock: expected,
            actualStock: actual,
            diff: actual - expected,
          },
        });
        await tx.item.update({ where: { id: line.itemId }, data: { stock: line.actualStock } });
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            type: 'AJUSTE',
            delta: actual - expected,
            note: `Conteo físico ${businessDate}`,
            createdById: user.id,
          },
        });
      }
      await this.audit.log(
        { action: 'STOCK_COUNT', entity: 'StockCount', entityId: count.id, after: { businessDate, lines }, user },
        tx,
      );
      return count;
    });
  }

  async stockCounts(limit = 50) {
    return this.prisma.stockCount.findMany({
      include: { countedBy: { select: { name: true } }, lines: { include: { item: { select: { name: true } } } } },
      orderBy: { countedAt: 'desc' },
      take: limit,
    });
  }

  async stockMovements(itemId?: string, limit = 100) {
    return this.prisma.stockMovement.findMany({
      where: itemId ? { itemId } : undefined,
      include: { item: { select: { name: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private clean(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
}
