import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { parse } from '../common/parse';
import { SettingsService } from '../services/settings.service';

const settingsSchema = z.record(z.string(), z.unknown());

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async all() {
    return this.settings.all();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch()
  async update(@Body() body: unknown) {
    const values = parse(settingsSchema, body);
    for (const [key, value] of Object.entries(values)) {
      await this.settings.set(key, value);
    }
    return this.settings.all();
  }
}
