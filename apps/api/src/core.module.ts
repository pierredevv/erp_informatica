import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { config } from './common/config';
import { CsrfGuard, JwtAuthGuard, RolesGuard, ShiftGuard } from './common/guards';
import { PrismaService } from './common/prisma.service';
import { AuthController } from './controllers/auth.controller';
import { CashController } from './controllers/cash.controller';
import { HealthController } from './controllers/health.controller';
import { ItemsController, StockCountsController } from './controllers/items.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { PurchasesController } from './controllers/purchases.controller';
import { ReportsController } from './controllers/reports.controller';
import { SalesController } from './controllers/sales.controller';
import { SettingsController } from './controllers/settings.controller';
import { ShiftsController, UsersController } from './controllers/users.controller';
import { AlertsService } from './services/alerts.service';
import { AuditService } from './services/audit.service';
import { AuthService } from './services/auth.service';
import { CashService } from './services/cash.service';
import { ItemsService } from './services/items.service';
import { MailService } from './services/mail.service';
import { NotificationService } from './services/notification.service';
import { PurchasesService } from './services/purchases.service';
import { ReportsService } from './services/reports.service';
import { SalesService } from './services/sales.service';
import { SettingsService } from './services/settings.service';
import { ShiftService } from './services/shift.service';
import { UsersService } from './services/users.service';

@Module({
  imports: [
    JwtModule.register({
      secret: config.jwtSecret,
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [
    AuthController,
    UsersController,
    ShiftsController,
    ItemsController,
    StockCountsController,
    SalesController,
    PurchasesController,
    CashController,
    ReportsController,
    NotificationsController,
    SettingsController,
    HealthController,
  ],
  providers: [
    PrismaService,
    AuditService,
    AuthService,
    UsersService,
    ShiftService,
    SettingsService,
    NotificationService,
    MailService,
    AlertsService,
    CashService,
    ItemsService,
    SalesService,
    PurchasesService,
    ReportsService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ShiftGuard },
  ],
})
export class CoreModule {}
