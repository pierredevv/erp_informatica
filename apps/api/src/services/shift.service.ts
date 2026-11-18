import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ShiftTemplate } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function overnight(start: string, end: string): boolean {
  return minutesOf(end) <= minutesOf(start);
}

@Injectable()
export class ShiftService {
  constructor(private readonly prisma: PrismaService) {}

  async isInShift(userId: string, at: Date = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) return false;
    if (user.role === 'ADMIN') return true;

    const templates = await this.prisma.shiftTemplate.findMany({
      where: { userId, active: true, user: { active: true } },
    });
    if (templates.length === 0) return false;

    const local = DateTime.fromJSDate(at).setZone(config.timezone);
    const weekday = local.weekday;
    const yesterday = local.minus({ days: 1 }).weekday;
    const now = local.hour * 60 + local.minute;

    return templates.some((shift) => {
      const start = minutesOf(shift.startTime);
      const end = minutesOf(shift.endTime);
      if (start === end) return true;
      if (!overnight(shift.startTime, shift.endTime)) {
        return shift.weekday === weekday && now >= start && now < end;
      }
      return (
        (shift.weekday === weekday && now >= start) ||
        (shift.weekday === yesterday && now < end)
      );
    });
  }

  async listForUser(userId: string): Promise<ShiftTemplate[]> {
    return this.prisma.shiftTemplate.findMany({
      where: { userId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async replaceWeekly(userId: string, shifts: Array<{ weekday: number; startTime: string; endTime: string }>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === 'ADMIN') throw new BadRequestException('Los administradores no requieren turnos');

    const seen = new Set<string>();
    for (const shift of shifts) {
      if (shift.startTime === shift.endTime) {
        throw new BadRequestException('La hora de inicio y fin no pueden ser iguales');
      }
      const key = `${shift.weekday}-${shift.startTime}-${shift.endTime}`;
      if (seen.has(key)) throw new BadRequestException('Hay turnos duplicados');
      seen.add(key);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.shiftTemplate.deleteMany({ where: { userId } });
      await tx.shiftTemplate.createMany({
        data: shifts.map((shift) => ({ userId, ...shift, active: true })),
      });
      return tx.shiftTemplate.findMany({ where: { userId }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
    });
  }

  async create(data: {
    userId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    active: boolean;
  }): Promise<ShiftTemplate> {
    if (data.startTime === data.endTime) {
      throw new BadRequestException('La hora de inicio y fin no pueden ser iguales');
    }
    return this.prisma.shiftTemplate.create({ data });
  }

  async update(
    id: string,
    data: Partial<{ weekday: number; startTime: string; endTime: string; active: boolean }>,
  ): Promise<ShiftTemplate> {
    const current = await this.prisma.shiftTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Turno no encontrado');
    const start = data.startTime ?? current.startTime;
    const end = data.endTime ?? current.endTime;
    if (start === end) throw new BadRequestException('La hora de inicio y fin no pueden ser iguales');
    return this.prisma.shiftTemplate.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.shiftTemplate.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Turno no encontrado');
    });
  }

  async coverage(): Promise<Array<{ weekday: number; shifts: Array<{ user: string; startTime: string; endTime: string }> }>> {
    const templates = await this.prisma.shiftTemplate.findMany({
      where: { active: true, user: { active: true, deletedAt: null } },
      include: { user: { select: { name: true } } },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    return Array.from({ length: 7 }, (_, index) => {
      const weekday = index + 1;
      return {
        weekday,
        shifts: templates
          .filter((t) => t.weekday === weekday)
          .map((t) => ({ user: t.user.name, startTime: t.startTime, endTime: t.endTime })),
      };
    });
  }

  async closingUserId(businessDate: string): Promise<string | null> {
    const weekday = DateTime.fromISO(businessDate, { zone: config.timezone }).weekday;
    const templates = await this.prisma.shiftTemplate.findMany({
      where: {
        active: true,
        weekday,
        user: { role: 'ENCARGADO', active: true, deletedAt: null },
      },
    });
    if (templates.length === 0) {
      const admin = await this.prisma.user.findFirst({
        where: { role: 'ADMIN', active: true, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return admin?.id ?? null;
    }
    const ranked = templates
      .map((t) => ({
        userId: t.userId,
        effectiveEnd: minutesOf(t.endTime) + (overnight(t.startTime, t.endTime) ? 1440 : 0),
      }))
      .sort((a, b) => b.effectiveEnd - a.effectiveEnd);
    return ranked[0]?.userId ?? null;
  }

  async graceEndFor(userId: string, businessDate: string): Promise<Date | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    if (user.role === 'ADMIN') return null;

    const templates = await this.prisma.shiftTemplate.findMany({
      where: { userId, active: true },
    });
    if (templates.length === 0) return null;

    const chosen = templates
      .map((t) => ({
        shift: t,
        effectiveEnd: minutesOf(t.endTime) + (overnight(t.startTime, t.endTime) ? 1440 : 0),
      }))
      .sort((a, b) => b.effectiveEnd - a.effectiveEnd)[0].shift;

    let end = DateTime.fromISO(`${businessDate}T${chosen.endTime}`, { zone: config.timezone });
    if (overnight(chosen.startTime, chosen.endTime)) end = end.plus({ days: 1 });
    return end.plus({ minutes: config.closeGraceMinutes }).toJSDate();
  }

  async currentInfo(userId: string, at: Date = new Date()): Promise<{ inShift: boolean; localTime: string }> {
    const local = DateTime.fromJSDate(at).setZone(config.timezone);
    return {
      inShift: await this.isInShift(userId, at),
      localTime: local.toFormat('yyyy-MM-dd HH:mm'),
    };
  }
}
