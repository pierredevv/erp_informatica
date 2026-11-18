import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { closeCashSchema, openCashSchema, reopenCashSchema } from '@erp/shared';
import { AllowOutOfShift, CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { parse } from '../common/parse';
import { CashService } from '../services/cash.service';

@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('current')
  async current() {
    return this.cash.detail();
  }

  @Get('by-date/:date')
  async byDate(@Param('date') date: string) {
    const session = await this.cash.getByDate(date);
    if (!session) {
      // Misma forma que `current()`: el frontend espera `expected` y `movements`.
      return {
        session: null,
        expected: { cashIn: 0, cashOut: 0, qrIn: 0, qrOut: 0, expectedCash: 0, expectedQr: 0 },
        movements: [],
      };
    }
    return this.cash.detail(session.id);
  }

  @Post('open')
  async open(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(openCashSchema, body);
    return this.cash.open(user, data.openingAmount);
  }

  @AllowOutOfShift()
  @Post('close')
  async close(@Body() body: unknown, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const data = parse(closeCashSchema, body);
    return this.cash.close(
      user,
      data,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('prepare-close')
  async prepareClose() {
    const session = await this.cash.getCurrent();
    if (!session) return { ok: false, message: 'No hay caja abierta' };
    await this.cash.prepareClose(session);
    return { ok: true };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('reopen')
  async reopen(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(reopenCashSchema, body);
    return this.cash.reopen(user, data.reason);
  }
}
