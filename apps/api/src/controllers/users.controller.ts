import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createUserSchema, shiftSchema, updateUserSchema, weeklyScheduleSchema } from '@erp/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { parse } from '../common/parse';
import { UsersService } from '../services/users.service';
import { ShiftService } from '../services/shift.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly shifts: ShiftService,
  ) {}

  @Get()
  async list() {
    return this.users.list(true);
  }

  @Get(':id/shifts')
  async listShifts(@Param('id') id: string) {
    return this.shifts.listForUser(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(createUserSchema, body);
    return this.users.create(data, user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const data = parse(updateUserSchema, body);
    return this.users.update(id, data, user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.deactivate(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.resetPassword(id, user);
  }
}

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftService) {}

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get('coverage')
  async coverage() {
    return this.shifts.coverage();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('weekly')
  async replaceWeekly(@Body() body: unknown) {
    const data = parse(weeklyScheduleSchema, body);
    return this.shifts.replaceWeekly(data.userId, data.shifts);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  async create(@Body() body: unknown) {
    const data = parse(shiftSchema, body);
    return this.shifts.create(data);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = parse(shiftSchema.partial(), body);
    return this.shifts.update(id, data);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post(':id/disable')
  async disable(@Param('id') id: string) {
    return this.shifts.update(id, { active: false });
  }
}
