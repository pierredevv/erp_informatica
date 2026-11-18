import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import type { CashSession, PaymentMethod, User } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import type { AuthUser } from '../common/decorators';
import { AuditService } from './audit.service';
import { NotificationService } from './notification.service';
import { MailService } from './mail.service';
import { SettingsService } from './settings.service';
import { ShiftService } from './shift.service';

export interface ExpectedAmounts {
  cashIn: number;
  cashOut: number;
  qrIn: number;
  qrOut: number;
  expectedCash: number;
  expectedQr: number;
}

@Injectable()
export class CashService {
  private readonly logger = new Logger(CashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly shifts: ShiftService,
  ) {}

  businessDateNow(): string {
    return DateTime.now().setZone(config.timezone).toISODate()!;
  }

  async getCurrent(): Promise<CashSession | null> {
    return this.prisma.cashSession.findFirst({
      where: { status: 'ABIERTA' },
      orderBy: { businessDate: 'desc' },
    });
  }

  async getByDate(businessDate: string): Promise<CashSession | null> {
    return this.prisma.cashSession.findUnique({
      where: { businessDate: new Date(`${businessDate}T00:00:00.000Z`) },
    });
  }

  async open(user: AuthUser, openingAmount?: string): Promise<CashSession> {
    const businessDate = this.businessDateNow();
    const existing = await this.getByDate(businessDate);
    if (existing?.status === 'ABIERTA') return existing;
    if (existing?.status === 'CERRADA') {
      throw new BadRequestException('La caja de hoy ya fue cerrada. Solo el administrador puede reabrirla.');
    }
    const amount = openingAmount ?? (await this.settings.get<string>('openingAmountDefault'));
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cashSession.create({
        data: {
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          openingAmount: amount,
          openedById: user.id,
        },
      });
      await this.audit.log(
        { action: 'CASH_OPEN', entity: 'CashSession', entityId: created.id, after: { openingAmount: amount }, user },
        tx,
      );
      return created;
    });
    return session;
  }

  async requireOpen(): Promise<CashSession> {
    const session = await this.getCurrent();
    if (!session) throw new BadRequestException('No hay una caja abierta. Debe abrirla el encargado del día.');
    return session;
  }

  async expected(session: CashSession): Promise<ExpectedAmounts> {
    const grouped = await this.prisma.cashMovement.groupBy({
      by: ['method', 'direction'],
      where: { sessionId: session.id },
      _sum: { amount: true },
    });
    let cashIn = 0;
    let cashOut = 0;
    let qrIn = 0;
    let qrOut = 0;
    for (const row of grouped) {
      const value = Number(row._sum.amount ?? 0);
      if (row.method === 'EFECTIVO') {
        if (row.direction === 'IN') cashIn += value;
        else cashOut += value;
      } else {
        if (row.direction === 'IN') qrIn += value;
        else qrOut += value;
      }
    }
    return {
      cashIn,
      cashOut,
      qrIn,
      qrOut,
      expectedCash: Number(session.openingAmount) + cashIn - cashOut,
      expectedQr: qrIn - qrOut,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async closeScheduler(): Promise<void> {
    const local = DateTime.now().setZone(config.timezone);
    const configured = await this.settings.get<string>('closeTime');
    if (local.toFormat('HH:mm') !== configured) return;

    const session = await this.getCurrent();
    if (!session || session.closeNotifiedAt) return;
    await this.prepareClose(session);
  }

  async prepareClose(session: CashSession): Promise<void> {
    const expected = await this.expected(session);
    await this.prisma.cashSession.update({
      where: { id: session.id },
      data: {
        expectedCash: expected.expectedCash,
        expectedQr: expected.expectedQr,
        expectedAt: new Date(),
        closeNotifiedAt: new Date(),
      },
    });

    const closingUserId = await this.shifts.closingUserId(this.businessDateNow());
    const recipients = await this.prisma.user.findMany({
      where: {
        active: true,
        deletedAt: null,
        OR: [{ role: 'ADMIN' }, ...(closingUserId ? [{ id: closingUserId }] : [])],
      },
      select: { id: true, role: true },
    });
    for (const recipient of recipients) {
      await this.notifications.create(
        recipient.id,
        'CIERRE_CAJA',
        'Hora de cerrar caja',
        `El cierre automático está listo. Efectivo esperado: ${expected.expectedCash.toFixed(2)} BOB. QR esperado: ${expected.expectedQr.toFixed(2)} BOB.`,
        { sessionId: session.id },
      );
    }
    const adminEmail = await this.settings.get<string>('adminEmail');
    await this.mail.enqueue(
      adminEmail,
      'Aviso: cierre de caja pendiente',
      `La caja del ${session.businessDate.toISOString().slice(0, 10)} debe cerrarse. ` +
        `Efectivo esperado: ${expected.expectedCash.toFixed(2)} BOB. QR esperado: ${expected.expectedQr.toFixed(2)} BOB.`,
    );
    this.logger.log(`Cierre preparado para la sesión ${session.id}`);
  }

  async close(
    user: AuthUser,
    input: { countedCash: string; countedQr?: string | null; note?: string | null },
    meta?: { ip?: string; userAgent?: string },
  ): Promise<CashSession> {
    const session = await this.getCurrent();
    if (!session) throw new NotFoundException('No hay caja abierta para cerrar');

    if (user.role !== 'ADMIN') {
      const closingUserId = await this.shifts.closingUserId(this.businessDateNow());
      if (closingUserId !== user.id) {
        throw new ForbiddenException('Solo el encargado asignado al cierre o el administrador pueden cerrar la caja');
      }
      const graceEnd = await this.shifts.graceEndFor(user.id, this.businessDateNow());
      if (graceEnd && new Date() > graceEnd) {
        throw new ForbiddenException('Pasó el tiempo permitido para cerrar. Debe hacerlo el administrador.');
      }
    }

    const expected = await this.expected(session);
    const countedCash = Number(input.countedCash);
    const countedQr = input.countedQr === null || input.countedQr === undefined ? expected.expectedQr : Number(input.countedQr);
    const diffCash = Math.round((countedCash - expected.expectedCash) * 100) / 100;
    const diffQr = Math.round((countedQr - expected.expectedQr) * 100) / 100;
    if ((diffCash !== 0 || diffQr !== 0) && !input.note?.trim()) {
      throw new BadRequestException('Debe indicar una nota cuando hay diferencia en el arqueo');
    }

    const closed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'CERRADA',
          expectedCash: expected.expectedCash,
          expectedQr: expected.expectedQr,
          countedCash,
          countedQr,
          diffCash,
          diffQr,
          qrCountedManually: input.countedQr !== null && input.countedQr !== undefined,
          note: input.note ?? null,
          closedById: user.id,
          closedAt: new Date(),
          expectedAt: session.expectedAt ?? new Date(),
        },
      });
      await this.audit.log(
        {
          action: 'CASH_CLOSE',
          entity: 'CashSession',
          entityId: updated.id,
          before: { status: session.status },
          after: {
            status: 'CERRADA',
            expectedCash: expected.expectedCash,
            countedCash,
            diffCash,
            expectedQr: expected.expectedQr,
            countedQr,
            diffQr,
          },
          user,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        tx,
      );
      return updated;
    });

    if (diffCash !== 0 || diffQr !== 0) {
      const adminEmail = await this.settings.get<string>('adminEmail');
      await this.mail.enqueue(
        adminEmail,
        `Cierre con diferencia - ${session.businessDate.toISOString().slice(0, 10)}`,
        `Diferencia efectivo: ${diffCash.toFixed(2)} BOB. Diferencia QR: ${diffQr.toFixed(2)} BOB. Nota: ${input.note}`,
      );
      await this.notifications.createForRole(
        'ADMIN',
        'CIERRE_CERRADO',
        'Caja cerrada con diferencia',
        `Efectivo ${diffCash.toFixed(2)} BOB / QR ${diffQr.toFixed(2)} BOB. Motivo: ${input.note}`,
        { sessionId: session.id },
      );
    }
    return closed;
  }

  async reopen(user: AuthUser, reason: string): Promise<CashSession> {
    const session = await this.getCurrent() ?? (await this.prisma.cashSession.findFirst({
      where: { status: 'CERRADA' },
      orderBy: { businessDate: 'desc' },
    }));
    if (!session) throw new NotFoundException('No hay caja para reabrir');
    if (session.status === 'ABIERTA') return session;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'ABIERTA',
          closedById: null,
          closedAt: null,
          countedCash: null,
          countedQr: null,
          diffCash: null,
          diffQr: null,
          closeNotifiedAt: null,
          note: `REAPERTURA: ${reason}`,
        },
      });
      await this.audit.log(
        {
          action: 'CASH_REOPEN',
          entity: 'CashSession',
          entityId: updated.id,
          after: { reason },
          user,
        },
        tx,
      );
      return updated;
    });
  }

  async detail(sessionId?: string) {
    const sessionInclude = {
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
    } as const;
    const session = sessionId
      ? await this.prisma.cashSession.findUnique({ where: { id: sessionId }, include: sessionInclude })
      : await this.prisma.cashSession.findFirst({ where: { status: 'ABIERTA' }, orderBy: { businessDate: 'desc' }, include: sessionInclude })
        ?? (await this.prisma.cashSession.findFirst({ orderBy: { businessDate: 'desc' }, include: sessionInclude }));
    if (!session) {
      return {
        session: null,
        expected: { cashIn: 0, cashOut: 0, qrIn: 0, qrOut: 0, expectedCash: 0, expectedQr: 0 },
        movements: [],
      };
    }
    const movements = await this.prisma.cashMovement.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    });
    return { session, expected: await this.expected(session), movements };
  }

  assertPaymentMethod(method: PaymentMethod): void {
    if (!['EFECTIVO', 'QR'].includes(method)) throw new BadRequestException('Medio de pago inválido');
  }

  async assertUserCanOperate(user: User): Promise<void> {
    if (user.role === 'ADMIN') return;
    const inShift = await this.shifts.isInShift(user.id);
    if (!inShift) throw new ForbiddenException('Fuera de tu horario asignado');
  }
}
