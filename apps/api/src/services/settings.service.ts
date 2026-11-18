import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';

const defaults: Record<string, unknown> = {
  qrImageUrl: '',
  qrLabel: 'QR fijo del centro',
  closeTime: config.closeTime,
  closeGraceMinutes: config.closeGraceMinutes,
  openingAmountDefault: config.openingAmountDefault,
  adminEmail: config.adminEmail,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string): Promise<T> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return (row?.value ?? defaults[key]) as T;
  }

  async all(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany();
    const result: Record<string, unknown> = { ...defaults };
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }
}
