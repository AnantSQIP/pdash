import { Controller, Get, Global, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';

export type NotifyInput = { type: string; title: string; message: string; link?: string };

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a notification for one or many recipients. BEST-EFFORT: a notification
   * failure must never break the operation that triggered it. The caller (the actor
   * who performed the action) is never notified about their own action.
   */
  async notify(userIds: string | string[], input: NotifyInput): Promise<void> {
    const actorId = getActorId();
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))].filter(id => id !== actorId);
    if (!ids.length) return;
    try {
      await this.prisma.notification.createMany({
        data: ids.map(userId => ({ userId, type: input.type, title: input.title, message: input.message, link: input.link ?? null })),
      });
    } catch { /* swallow — notifications are non-critical */ }
  }

  listForUser(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string) {
    // Scope to the recipient — a user can only mark THEIR OWN notification read.
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { ok: true };
  }
}

// All routes are scoped to the authenticated actor's OWN notifications (AuthGuard
// requires a resolved actor; no @Public). No extra permission is needed — every user
// may read/clear their own notifications, and never anyone else's.
@Controller('notifications')
class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    const actorId = getActorId();
    if (!actorId) return [];
    return this.service.listForUser(actorId, limit ? parseInt(limit, 10) : 30);
  }

  @Get('unread-count')
  async unreadCount() {
    const actorId = getActorId();
    return { count: actorId ? await this.service.unreadCount(actorId) : 0 };
  }

  @Post(':id/read')
  read(@Param('id') id: string) {
    const actorId = getActorId();
    if (!actorId) return { ok: false };
    return this.service.markRead(id, actorId);
  }

  @Post('read-all')
  readAll() {
    const actorId = getActorId();
    if (!actorId) return { ok: false };
    return this.service.markAllRead(actorId);
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
