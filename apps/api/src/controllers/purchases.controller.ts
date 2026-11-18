import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { createPurchaseSchema, supplierSchema } from '@erp/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { parse } from '../common/parse';
import { PurchasesService } from '../services/purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  async list(@Query() query: { from?: string; to?: string }) {
    return this.purchases.list(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.purchases.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(createPurchaseSchema, body);
    return this.purchases.create(user, data);
  }

  @Get('suppliers/list')
  async suppliers() {
    return this.purchases.suppliers();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('suppliers')
  async createSupplier(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(supplierSchema, body);
    return this.purchases.createSupplier(data, user);
  }
}
