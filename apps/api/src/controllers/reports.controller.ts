import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ReportsService } from '../services/reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  async dashboard() {
    return this.reports.dashboard();
  }

  @Get('reconciliation')
  async reconciliation(@Query('date') date?: string) {
    return this.reports.dailyReconciliation(date);
  }

  @Get('inventory')
  async inventory() {
    return this.reports.inventory();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('audit')
  async audit() {
    return this.reports.auditReport();
  }

  @Get('price-history/:itemId')
  async priceHistory(@Param('itemId') itemId: string) {
    return this.reports.priceHistory(itemId);
  }
}
