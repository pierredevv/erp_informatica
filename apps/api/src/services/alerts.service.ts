import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Item } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationService } from './notification.service';
import { MailService } from './mail.service';
import { SettingsService } from './settings.service';

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  async lowItems(): Promise<Item[]> {
    return this.prisma.$queryRaw<Item[]>`
      SELECT * FROM "Item"
      WHERE active = true
        AND stock IS NOT NULL
        AND "minStock" IS NOT NULL
        AND stock <= "minStock"
      ORDER BY name ASC
    `;
  }

  async check(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    const items = await this.prisma.item.findMany({
      where: {
        id: { in: itemIds },
        active: true,
        stock: { not: null },
        minStock: { not: null },
      },
    });
    const low = items.filter((item) => Number(item.stock) <= Number(item.minStock));
    if (low.length === 0) return;

    const adminEmail = await this.settings.get<string>('adminEmail');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const item of low) {
      await this.notifications.createForRole(
        'ADMIN',
        'STOCK_BAJO',
        `Stock bajo: ${item.name}`,
        `Quedan ${item.stock} ${item.unit ?? 'unidades'} (mínimo ${item.minStock}).`,
        { itemId: item.id },
      );
      await this.notifications.createForRole(
        'ENCARGADO',
        'STOCK_BAJO',
        `Stock bajo: ${item.name}`,
        `Quedan ${item.stock} ${item.unit ?? 'unidades'}. Pedir ${item.reorderQty ?? item.minStock}.`,
        { itemId: item.id },
      );

      const alreadySent = await this.prisma.alertNotification.findFirst({
        where: { itemId: item.id, kind: 'UMBRAL', recipient: adminEmail, sentAt: { gte: since } },
      });
      if (!alreadySent) {
        await this.mail.enqueue(
          adminEmail,
          `Alerta de stock bajo: ${item.name}`,
          `El producto ${item.name} tiene ${item.stock} ${item.unit ?? 'unidades'} disponibles. ` +
            `El mínimo configurado es ${item.minStock}. Cantidad sugerida: ${item.reorderQty ?? item.minStock}.`,
        );
        await this.prisma.alertNotification.create({
          data: { itemId: item.id, kind: 'UMBRAL', recipient: adminEmail },
        });
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async dailyDigest(): Promise<void> {
    const low = await this.lowItems();
    if (low.length === 0) return;
    const adminEmail = await this.settings.get<string>('adminEmail');
    const lines = low.map(
      (item) => `- ${item.name}: ${item.stock} ${item.unit ?? 'unidades'} (mín. ${item.minStock}; pedir ${item.reorderQty ?? item.minStock})`,
    );
    await this.mail.enqueue(
      adminEmail,
      `Resumen diario de stock bajo (${low.length} productos)`,
      lines.join('\n'),
    );
  }
}
