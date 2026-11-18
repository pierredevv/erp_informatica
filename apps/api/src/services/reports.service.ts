import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { CashService } from './cash.service';
import { AlertsService } from './alerts.service';
import { AuditService } from './audit.service';
import { ShiftService } from './shift.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cash: CashService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
    private readonly shifts: ShiftService,
  ) {}

  async dashboard() {
    const businessDate = this.cash.businessDateNow();
    const start = DateTime.fromISO(businessDate, { zone: config.timezone }).startOf('day').toJSDate();
    const end = DateTime.fromISO(businessDate, { zone: config.timezone }).endOf('day').toJSDate();
    const session = await this.cash.getCurrent() ?? (await this.cash.getByDate(businessDate));
    const expected = session ? await this.cash.expected(session) : null;
    const [salesCount, salesSum, purchasesSum, lowItems, coverage] = await Promise.all([
      this.prisma.sale.count({ where: { soldAt: { gte: start, lte: end }, status: 'CONFIRMADA' } }),
      this.prisma.sale.aggregate({ where: { soldAt: { gte: start, lte: end }, status: 'CONFIRMADA' }, _sum: { total: true } }),
      this.prisma.purchase.aggregate({ where: { purchasedAt: { gte: start, lte: end } }, _sum: { total: true } }),
      this.alerts.lowItems(),
      this.shifts.coverage(),
    ]);
    const today = DateTime.fromISO(businessDate, { zone: config.timezone }).weekday;
    return {
      businessDate,
      session,
      expected,
      salesCount,
      salesTotal: Number(salesSum._sum.total ?? 0),
      purchasesTotal: Number(purchasesSum._sum.total ?? 0),
      lowStockCount: lowItems.length,
      lowStock: lowItems.slice(0, 10),
      todayShifts: coverage[today - 1]?.shifts ?? [],
    };
  }

  async dailyReconciliation(businessDate = this.cash.businessDateNow()) {
    const session = await this.cash.getByDate(businessDate);
    if (!session) return { businessDate, session: null, message: 'No hay caja registrada para esa fecha' };
    const expected = await this.cash.expected(session);
    const movements = await this.prisma.cashMovement.findMany({
      where: { sessionId: session.id },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const sales = await this.prisma.sale.findMany({
      where: { sessionId: session.id },
      include: { createdBy: { select: { name: true } }, items: true },
      orderBy: { soldAt: 'asc' },
    });
    const purchases = await this.prisma.purchase.findMany({
      where: { sessionId: session.id },
      include: { createdBy: { select: { name: true } }, items: true },
      orderBy: { purchasedAt: 'asc' },
    });
    const byUser = sales
      .filter((sale) => sale.status === 'CONFIRMADA')
      .reduce<Record<string, { name: string; count: number; total: number }>>((acc, sale) => {
        const key = sale.createdBy.name;
        acc[key] ??= { name: key, count: 0, total: 0 };
        acc[key].count += 1;
        acc[key].total += Number(sale.total);
        return acc;
      }, {});
    return {
      businessDate,
      session,
      expected,
      movements,
      sales,
      purchases,
      byUser: Object.values(byUser),
      diffCash: session.diffCash ? Number(session.diffCash) : null,
      diffQr: session.diffQr ? Number(session.diffQr) : null,
    };
  }

  async inventory() {
    const items = await this.prisma.item.findMany({ orderBy: { name: 'asc' } });
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      stock: item.stock ? Number(item.stock) : null,
      minStock: item.minStock ? Number(item.minStock) : null,
      lastCost: item.lastCost ? Number(item.lastCost) : null,
      value: item.stock && item.lastCost ? Number(item.stock) * Number(item.lastCost) : 0,
      low: item.stock !== null && item.minStock !== null && Number(item.stock) <= Number(item.minStock),
    }));
  }

  async auditReport(limit = 200) {
    return { entries: await this.audit.list(limit), integrity: await this.audit.verify() };
  }

  async priceHistory(itemId: string) {
    return this.prisma.purchaseItem.findMany({
      where: { itemId },
      include: { purchase: { select: { purchasedAt: true, supplierName: true } } },
      orderBy: { purchase: { purchasedAt: 'desc' } },
    });
  }
}
