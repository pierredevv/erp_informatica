import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createItemSchema,
  stockAdjustSchema,
  stockCountSchema,
  updateItemSchema,
} from '@erp/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { parse } from '../common/parse';
import { ItemsService } from '../services/items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  async list(@Query('includeInactive') includeInactive?: string) {
    return this.items.list(includeInactive === 'true');
  }

  @Get(':id/stock-movements')
  async movements(@Param('id') id: string) {
    return this.items.stockMovements(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(createItemSchema, body);
    return this.items.create(data as Record<string, unknown>, user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(updateItemSchema, body);
    return this.items.update(id, data as Record<string, unknown>, user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.items.deactivate(id, user);
  }

  @Post(':id/adjust-stock')
  async adjust(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(stockAdjustSchema, body);
    return this.items.adjustStock(id, data.newStock, data.note, user);
  }
}

@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  async list() {
    return this.items.stockCounts();
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(stockCountSchema, body);
    return this.items.createStockCount(data.businessDate, data.note, data.lines, user);
  }
}
