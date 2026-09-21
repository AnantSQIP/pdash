import { Body, Controller, ForbiddenException, Get, Global, Injectable, Module, Param, Post, Put, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';
import { WorkspaceFlowService } from '../workspace-flow/workspace-flow.service';

// A notification can name the channel it came from so a per-channel mute can suppress it.
export type NotifyInput = { type: string; title: string; message: string; link?: string; channelId?: string };

// Preference categories a user can mute. Every notification type maps to exactly one.
export const NOTIF_CATEGORIES = ['mentions', 'discussions', 'tasks', 'projects', 'attendance', 'expenses', 'other'] as const;
export function categoryOf(type: string): string {
  if (type.endsWith('.mention')) return 'mentions'; // discussion.mention, comment.mention, …
  if (type.startsWith('discussion.')) return 'discussions';
  if (type.startsWith('task.')) return 'tasks';
  if (type.startsWith('project.')) return 'projects';
  if (type.startsWith('leave.') || type.startsWith('compoff.') || type.startsWith('wfh.') || type.startsWith('attendance.')) return 'attendance';
  if (type.startsWith('expense.')) return 'expenses';
  return 'other';
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flows: WorkspaceFlowService,
  ) {}

  /**
   * Which workspace flow's work a notification is about, read off the row its link names
   * (docs/WORKSPACE_FLOWS.md). A link into a project/client row carries that row's flow; anything
   * else — leave, an expense, a mention in a team space, a link to no row at all — is about
   * neither flow and is shown in both.
   *
   * It is stamped when the notification is written rather than worked out when the bell is read,
   * because by then the row may be the other flow's and the answer would change under a line that
   * has already been sent.
   */
  private async flowOfLink(link?: string | null): Promise<string | null> {
    const id = /^\/projects\/([^/?#]+)/.exec(link ?? '')?.[1];
    if (!id) return null;
    const p = await this.prisma.project.findUnique({ where: { id }, select: { workspaceFlow: true } });
    return p?.workspaceFlow ?? null;
  }

  /** The flow filter for a person's bell: their flow's work, plus everything that is neither's. */
  private async bellWhere(userId: string) {
    const flow = await this.flows.flowOfUser(userId);
    return { userId, OR: [{ workspaceFlow: null }, { workspaceFlow: flow }] };
  }

  /**
   * Create a notification for one or many recipients — but FIRST honour each
   * recipient's preferences: a person who muted this category (or the source
   * channel) simply doesn't get the row. BEST-EFFORT: a failure here never breaks
   * the operation that triggered it. The acting actor is never notified.
   */
  async notify(userIds: string | string[], input: NotifyInput): Promise<void> {
    const actorId = getActorId();
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))].filter(id => id !== actorId);
    if (!ids.length) return;
    try {
      const prefs = await this.prisma.notificationPreference.findMany({ where: { userId: { in: ids } } });
      const byUser = new Map(prefs.map(p => [p.userId, p]));
      const category = categoryOf(input.type);
      const recipients = ids.filter(id => {
        const p = byUser.get(id);
        if (!p) return true; // no preferences saved → default: notify
        const types = (p.types ?? {}) as Record<string, boolean>;
        if (types[category] === false) return false;
        if (input.channelId && Array.isArray(p.mutedChannels) && (p.mutedChannels as string[]).includes(input.channelId)) return false;
        return true;
      });
      if (!recipients.length) return;
      const workspaceFlow = await this.flowOfLink(input.link);
      await this.prisma.notification.createMany({
        data: recipients.map(userId => ({
          userId, type: input.type, title: input.title, message: input.message,
          link: input.link ?? null, workspaceFlow,
        })),
      });
    } catch { /* swallow — notifications are non-critical */ }
  }

  async listForUser(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: await this.bellWhere(userId),
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { ...await this.bellWhere(userId), isRead: false } });
  }

  async markRead(id: string, userId: string) {
    // Scope to the recipient — a user can only mark THEIR OWN notification read.
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    // Only what the person can actually see: "mark all read" must not silently clear the other
    // flow's unread lines, which would be waiting, already read, if the firm ever switches back.
    await this.prisma.notification.updateMany({ where: { ...await this.bellWhere(userId), isRead: false }, data: { isRead: true } });
    return { ok: true };
  }

  // ── preferences ──────────────────────────────────────────────────────────────
  async getPreferences(userId: string) {
    const p = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    const types = (p?.types ?? {}) as Record<string, boolean>;
    // Fill every category (default enabled) so the client always renders the full set.
    const full: Record<string, boolean> = {};
    for (const c of NOTIF_CATEGORIES) full[c] = types[c] !== false;
    return {
      types: full,
      mutedChannels: (p?.mutedChannels ?? []) as string[],
      quietStart: p?.quietStart ?? null,
      quietEnd: p?.quietEnd ?? null,
      soundEnabled: p?.soundEnabled ?? true,
    };
  }

  async setPreferences(userId: string, data: { types?: Record<string, boolean>; quietStart?: number | null; quietEnd?: number | null; soundEnabled?: boolean }) {
    const clampMin = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 1439 ? Math.floor(v) : null);
    // Keep only known categories from the client payload.
    const types: Record<string, boolean> = {};
    if (data.types) for (const c of NOTIF_CATEGORIES) if (c in data.types) types[c] = !!data.types[c];
    const update: Record<string, unknown> = {};
    if (data.types) update.types = types;
    if ('quietStart' in data) update.quietStart = data.quietStart == null ? null : clampMin(data.quietStart);
    if ('quietEnd' in data) update.quietEnd = data.quietEnd == null ? null : clampMin(data.quietEnd);
    if ('soundEnabled' in data) update.soundEnabled = !!data.soundEnabled;
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...update },
      update,
    });
    return this.getPreferences(userId);
  }

  async setChannelMute(userId: string, channelId: string, muted: boolean) {
    const p = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    const set = new Set(((p?.mutedChannels ?? []) as string[]));
    if (muted) set.add(channelId); else set.delete(channelId);
    const mutedChannels = [...set];
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, mutedChannels },
      update: { mutedChannels },
    });
    return { muted, mutedChannels };
  }
}

// All routes are scoped to the authenticated actor's OWN notifications (AuthGuard
// requires a resolved actor; no @Public). No extra permission is needed — every user
// may read/clear their own notifications and set their own preferences.
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

  @Get('preferences')
  getPreferences() {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.service.getPreferences(actorId);
  }

  @Put('preferences')
  setPreferences(@Body() body: { types?: Record<string, boolean>; quietStart?: number | null; quietEnd?: number | null; soundEnabled?: boolean }) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.service.setPreferences(actorId, body);
  }

  @Post('channels/:id/mute')
  mute(@Param('id') id: string) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.service.setChannelMute(actorId, id, true);
  }

  @Post('channels/:id/unmute')
  unmute(@Param('id') id: string) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated');
    return this.service.setChannelMute(actorId, id, false);
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
