import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PaymentMethod, Sale } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import type { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';
import { CashService } from './cash.service';
import { AlertsService } from './alerts.service';
import { ShiftService } from './shift.service';

export interface SaleLineInput {
  itemId: string;
  quantity: string;
  unitPrice?: string;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cash: CashService,
    private readonly alerts: AlertsService,
    private readonly shifts: ShiftService,
  ) {}

  async create(
    user: AuthUser,
    input: { method: PaymentMethod; discount: string; items: SaleLineInput[]; note?: string },
  ): Promise<Sale> {
    await this.cash.assertUserCanOperate(await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
    const session = await this.cash.requireOpen();

    const ids = input.items.map((line) => line.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: ids } } });
    const byId = new Map(items.map((item) => [item.id, item]));

    const lines = input.items.map((line) => {
      const item = byId.get(line.itemId);
      if (!item) throw new NotFoundException(`Item ${line.itemId} no encontrado`);
      if (!item.active) throw new BadRequestException(`${item.name} está inactivo`);
      const unitPrice = line.unitPrice ?? String(item.salePrice);
      const subtotal = Math.round(Number(unitPrice) * Number(line.quantity) * 100) / 100;
      if (item.type === 'PRODUCTO' && Number(item.stock ?? 0) < Number(line.quantity)) {
        throw new BadRequestException(`Stock insuficiente para ${item.name}`);
      }
      return { item, unitPrice, quantity: line.quantity, subtotal };
    });

    const subtotal = Math.round(lines.reduce((sum, line) => sum + line.subtotal, 0) * 100) / 100;
    const discount = Number(input.discount);
    if (discount > subtotal) throw new BadRequestException('El descuento no puede superar el subtotal');
    const total = Math.round((subtotal - discount) * 100) / 100;

    const sale = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { key: 'sale' },
        update: { value: { increment: 1 } },
        create: { key: 'sale', value: 1 },
      });
      const prefix = DateTime.now().setZone(config.timezone).toFormat('yyyyMMdd');
      const code = `V-${prefix}-${String(counter.value).padStart(4, '0')}`;

      const created = await tx.sale.create({
        data: {
          code,
          sessionId: session.id,
          createdById: user.id,
          subtotal,
          discount,
          total,
          method: input.method,
        },
      });

      for (const line of lines) {
        await tx.saleItem.create({
          data: {
            saleId: created.id,
            itemId: line.item.id,
            nameSnapshot: line.item.name,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            subtotal: line.subtotal,
          },
        });
        if (line.item.type === 'PRODUCTO') {
          const updated = await tx.item.updateMany({
            where: { id: line.item.id, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          });
          if (updated.count === 0) throw new BadRequestException(`Stock insuficiente para ${line.item.name}`);
          await tx.stockMovement.create({
            data: {
              itemId: line.item.id,
              type: 'VENTA',
              delta: -Number(line.quantity),
              saleId: created.id,
              createdById: user.id,
              note: `Venta ${code}`,
            },
          });
        }
      }

      await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          type: 'VENTA',
          direction: 'IN',
          method: input.method,
          amount: total,
          description: `Venta ${code}`,
          saleId: created.id,
          createdById: user.id,
        },
      });

      await this.audit.log(
        {
          action: 'SALE_CREATE',
          entity: 'Sale',
          entityId: created.id,
          after: { code, total, method: input.method, items: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })) },
          user,
        },
        tx,
      );
      return created;
    });

    await this.alerts.check(ids);
    return sale;
  }

  async list(filters: { from?: string; to?: string; userId?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.userId) where.createdById = filters.userId;
    if (filters.from || filters.to) {
      const soldAt: Record<string, Date> = {};
      if (filters.from) soldAt.gte = DateTime.fromISO(filters.from, { zone: config.timezone }).startOf('day').toJSDate();
      if (filters.to) soldAt.lte = DateTime.fromISO(filters.to, { zone: config.timezone }).endOf('day').toJSDate();
      where.soldAt = soldAt;
    }
    return this.prisma.sale.findMany({
      where: where as never,
      include: {
        items: true,
        createdBy: { select: { name: true, role: true } },
        session: { select: { businessDate: true } },
      },
      orderBy: { soldAt: 'desc' },
      take: 500,
    });
  }

  async findById(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true, createdBy: { select: { name: true } }, movements: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  async cancel(id: string, user: AuthUser, note: string): Promise<Sale> {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { items: true, movements: true } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status !== 'CONFIRMADA') throw new BadRequestException('La venta ya está anulada');

    return this.prisma.$transaction(async (tx) => {
      for (const line of sale.items) {
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (item?.type === 'PRODUCTO') {
          await tx.item.update({
            where: { id: line.itemId },
            data: { stock: { increment: Number(line.quantity) } },
          });
          await tx.stockMovement.create({
            data: {
              itemId: line.itemId,
              type: 'AJUSTE',
              delta: Number(line.quantity),
              saleId: sale.id,
              note: `Anulación ${sale.code}`,
              createdById: user.id,
            },
          });
        }
      }
      await tx.cashMovement.create({
        data: {
          sessionId: sale.sessionId,
          type: 'VENTA',
          direction: 'OUT',
          method: sale.method,
          amount: Number(sale.total),
          description: `Anulación ${sale.code}`,
          saleId: sale.id,
          createdById: user.id,
        },
      });
      const updated = await tx.sale.update({
        where: { id },
        data: {
          status: 'ANULADA',
          cancelledById: user.id,
          cancelledAt: new Date(),
          cancellationNote: note,
        },
      });
      await this.audit.log(
        {
          action: 'SALE_CANCEL',
          entity: 'Sale',
          entityId: id,
          after: { code: sale.code, note },
          user,
        },
        tx,
      );
      return updated;
    });
  }

  async assertCanOperate(user: AuthUser): Promise<void> {
    if (user.role === 'ADMIN') return;
    const allowed = await this.shifts.isInShift(user.id);
    if (!allowed) throw new ForbiddenException('Fuera de tu horario asignado');
  }
}
