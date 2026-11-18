import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { createSaleSchema } from '@erp/shared';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { parse } from '../common/parse';
import { SalesService } from '../services/sales.service';

const cancelSaleSchema = z.object({ note: z.string().trim().min(3) });

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  async list(@Query() query: { from?: string; to?: string; userId?: string }) {
    return this.sales.list(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.sales.findById(id);
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(createSaleSchema, body);
    return this.sales.create(user, data);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { note } = parse(cancelSaleSchema, body);
    return this.sales.cancel(id, user, note);
  }
}
