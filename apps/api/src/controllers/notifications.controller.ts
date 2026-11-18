import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { NotificationService } from '../services/notification.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return {
      items: await this.notifications.list(user.id),
      unread: await this.notifications.unreadCount(user.id),
    };
  }

  @Post(':id/read')
  async read(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.notifications.markRead(id, user.id);
    return { ok: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.id);
    return { ok: true };
  }
}
