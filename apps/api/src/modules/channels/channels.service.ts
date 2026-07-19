import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChannelDto, UpdateChannelDto, CreateMessageDto } from './dto';
import { getActorId } from '../../common/context/request-context';
import { NotificationsService } from '../notifications/notifications.module';
import { DocumentsService, DOC_SELECT } from '../documents/documents.service';

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, profilePhoto: true };
// Attachment projection on messages — deleted documents drop out automatically.
const ATTACHMENTS_INCLUDE = {
  where: { document: { deletedAt: null } },
  select: { document: { select: DOC_SELECT } },
} as const;
// A message with its author, attachments, reactions, mentions and (if it is one) poll.
const MSG_INCLUDE = {
  user: { select: USER_SELECT },
  attachments: ATTACHMENTS_INCLUDE,
  reactions: { select: { emoji: true, userId: true } },
  mentions: { select: { userId: true } },
  poll: {
    include: {
      options: { select: { id: true, text: true, sequence: true }, orderBy: { sequence: 'asc' } },
      votes: { select: { optionId: true, userId: true } },
    },
  },
} as const;

// Reactions are limited to a small curated set — this both keeps the UI tidy and
// prevents arbitrary/oversized strings being stored as an "emoji".
const ALLOWED_EMOJI = new Set(['👍', '❤️', '😄', '🎉', '👀', '🙏', '✅', '🔥']);

/**
 * Discussions are PRIVATE and MEMBER-GATED. Access is governed purely by channel
 * membership — NOT by any permission. This is deliberate: because there is no
 * permission short-circuit here, even a Super Admin cannot read or post in a
 * discussion they were not added to. The CREATOR owns the channel and is the only
 * one who can add/remove members, rename, or delete it.
 */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
  ) {}

  private actor(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  /** Verify the channel exists and the actor is a member; otherwise 404/403. No admin bypass. */
  private async assertMember(channelId: string): Promise<{ channel: { id: string; createdBy: string; archivedAt: Date | null }; actorId: string }> {
    const actorId = this.actor();
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, deletedAt: null }, select: { id: true, createdBy: true, archivedAt: true } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    const member = await this.prisma.channelMember.findUnique({ where: { channelId_userId: { channelId, userId: actorId } } });
    if (!member) throw new ForbiddenException('You are not a member of this discussion.');
    return { channel, actorId };
  }

  /** Verify the actor is the channel owner (creator); otherwise 404/403. */
  private async assertOwner(channelId: string): Promise<{ channel: { id: string; createdBy: string }; actorId: string }> {
    const actorId = this.actor();
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, deletedAt: null }, select: { id: true, createdBy: true } });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);
    if (channel.createdBy !== actorId) throw new ForbiddenException('Only the discussion owner can do this.');
    return { channel, actorId };
  }

  // ── mentions ────────────────────────────────────────────────────────────────
  /**
   * Find which channel members a message text @mentions. Mentions are detected by
   * scanning for "@First Last" against the CHANNEL's own members (never the whole
   * org), so a mention always resolves to someone who can actually see the message.
   * Also recognises the group mentions "@channel"/"@everyone" (all members) and any
   * named tag ("@attorneys") — a tag resolves only to its members who are ALSO in
   * this channel. The author is always excluded — you don't notify yourself.
   */
  private async scanMentions(channelId: string, content: string, excludeUserId: string): Promise<string[]> {
    if (!content.includes('@')) return [];
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    const memberIds = new Set(members.map(m => m.userId));
    const hits = new Set<string>();

    // Group mention: "@channel" or "@everyone" pings everyone in the channel.
    if (/@(channel|everyone)\b/i.test(content)) {
      for (const m of members) if (m.userId !== excludeUserId) hits.add(m.userId);
    }

    // Named tags: an org tag "@attorneys" resolves to its members present in this channel.
    const ch = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { organizationId: true } });
    if (ch) {
      const tags = await this.prisma.mentionTag.findMany({
        where: { organizationId: ch.organizationId },
        include: { members: { select: { userId: true } } },
      });
      for (const t of tags) {
        if (content.includes(`@${t.name}`)) {
          for (const tm of t.members) if (tm.userId !== excludeUserId && memberIds.has(tm.userId)) hits.add(tm.userId);
        }
      }
    }

    // Individual "@First Last" mentions.
    for (const m of members) {
      if (m.userId === excludeUserId) continue;
      const name = `${m.user.firstName} ${m.user.lastName ?? ''}`.trim();
      if (name && content.includes(`@${name}`)) hits.add(m.userId);
    }
    return [...hits];
  }

  private normalize<T extends { mentions?: { userId: string }[] }>(m: T) {
    const { mentions, ...rest } = m;
    return { ...rest, mentions: (mentions ?? []).map(x => x.userId) };
  }

  private async fetchMessage(id: string) {
    const m = await this.prisma.message.findUnique({ where: { id }, include: MSG_INCLUDE });
    return m ? this.normalize(m) : null;
  }

  /** Only the discussions the actor has been added to, each with the actor's unread count. */
  async listChannels(organizationId: string) {
    const actorId = this.actor();
    const channels = await this.prisma.channel.findMany({
      where: { organizationId, deletedAt: null, members: { some: { userId: actorId } } },
      include: {
        _count: { select: { messages: true, members: true } },
        messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, include: { user: { select: USER_SELECT } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // Unread = messages (from other people) newer than where the actor last read.
    const reads = await this.prisma.channelRead.findMany({
      where: { userId: actorId, channelId: { in: channels.map(c => c.id) } },
      select: { channelId: true, lastReadAt: true },
    });
    const readAt = new Map(reads.map(r => [r.channelId, r.lastReadAt]));
    const counts = await Promise.all(channels.map(c =>
      this.prisma.message.count({
        where: {
          channelId: c.id, deletedAt: null, userId: { not: actorId },
          ...(readAt.has(c.id) ? { createdAt: { gt: readAt.get(c.id)! } } : {}),
        },
      }),
    ));
    return channels.map((c, i) => ({ ...c, unreadCount: counts[i] }));
  }

  async getChannel(id: string) {
    await this.assertMember(id);
    return this.prisma.channel.findFirst({
      where: { id, deletedAt: null },
      include: { members: { include: { user: { select: USER_SELECT } } }, _count: { select: { messages: true } } },
    });
  }

  async createChannel(dto: CreateChannelDto) {
    const actorId = this.actor();
    // Owner = creator. Members = creator + everyone explicitly invited.
    const memberIds = [...new Set([actorId, ...(dto.memberIds ?? [])])];
    const channel = await this.prisma.channel.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        description: dto.description,
        type: 'PRIVATE',
        createdBy: actorId,
        members: { create: memberIds.map(userId => ({ userId })) },
      },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        _count: { select: { messages: true, members: true } },
      },
    });
    // Tell the invited people they were added (the creator is excluded automatically).
    await this.notifications.notify(dto.memberIds ?? [], {
      type: 'discussion.added', title: 'Added to a discussion',
      message: `You were added to the discussion "${channel.name}".`,
      link: `/discuss?channel=${channel.id}`, channelId: channel.id,
    });
    return channel;
  }

  async updateChannel(id: string, dto: UpdateChannelDto) {
    await this.assertOwner(id);
    return this.prisma.channel.update({ where: { id }, data: dto });
  }

  async deleteChannel(id: string) {
    await this.assertOwner(id);
    return this.prisma.channel.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listMessages(channelId: string, limit = 50) {
    await this.assertMember(channelId);
    // Fetch the LATEST `limit` messages (newest-first), then reverse so the client
    // renders oldest→newest. Deleted messages are kept as tombstones so the thread
    // doesn't reflow and deep links still resolve.
    const rows = await this.prisma.message.findMany({
      where: { channelId },
      include: MSG_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse().map(r => this.normalize(r));
  }

  /** Messages pinned in this channel (newest pin first) — powers the pinned pane. */
  async listPinned(channelId: string) {
    await this.assertMember(channelId);
    const rows = await this.prisma.message.findMany({
      where: { channelId, pinnedAt: { not: null }, deletedAt: null },
      include: MSG_INCLUDE,
      orderBy: { pinnedAt: 'desc' },
    });
    return rows.map(r => this.normalize(r));
  }

  async createMessage(channelId: string, dto: CreateMessageDto) {
    // Posting requires membership — there is NO auto-join (that would defeat privacy).
    const { channel, actorId } = await this.assertMember(channelId);
    if (channel.archivedAt) throw new BadRequestException('This discussion is archived and read-only.');
    const content = dto.content?.trim() ?? '';
    // Attachments must be the actor's own, still-unattached uploads.
    const documentIds = await this.documents.assertAttachable(dto.documentIds ?? [], actorId);
    if (!content && !documentIds.length) throw new BadRequestException('Message is empty.');
    const created = await this.prisma.message.create({
      data: {
        channelId,
        userId: actorId,
        content,
        attachments: documentIds.length ? { create: documentIds.map(documentId => ({ documentId })) } : undefined,
      },
    });
    await this.applyMentions(channelId, created.id, content, actorId, false);
    return this.fetchMessage(created.id);
  }

  /**
   * Record the message's @mentions and notify the newly-mentioned members. On edit,
   * mention rows removed from the text are dropped and only freshly-added people are
   * re-notified (so an edit doesn't re-ping everyone already mentioned).
   */
  private async applyMentions(channelId: string, messageId: string, content: string, actorId: string, isEdit: boolean) {
    const mentioned = await this.scanMentions(channelId, content, actorId);
    const already = isEdit
      ? new Set((await this.prisma.messageMention.findMany({ where: { messageId }, select: { userId: true } })).map(x => x.userId))
      : new Set<string>();
    if (isEdit) {
      await this.prisma.messageMention.deleteMany({ where: { messageId, userId: { notIn: mentioned.length ? mentioned : ['__none__'] } } });
    }
    if (mentioned.length) {
      await this.prisma.messageMention.createMany({ data: mentioned.map(userId => ({ messageId, userId })), skipDuplicates: true });
    }
    const fresh = mentioned.filter(id => !already.has(id));
    if (fresh.length) {
      const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
      const ch = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { name: true } });
      const who = actor ? `${actor.firstName} ${actor.lastName ?? ''}`.trim() : 'Someone';
      await this.notifications.notify(fresh, {
        type: 'discussion.mention',
        title: 'You were mentioned',
        message: `${who} mentioned you in "${ch?.name ?? 'a discussion'}".`,
        link: `/discuss?channel=${channelId}&message=${messageId}`, channelId,
      });
    }
  }

  async editMessage(channelId: string, messageId: string, content: string) {
    const { actorId } = await this.assertMember(channelId);
    const msg = await this.prisma.message.findFirst({ where: { id: messageId, channelId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.deletedAt) throw new BadRequestException('This message was deleted.');
    if (msg.userId !== actorId) throw new ForbiddenException('You can only edit your own messages.');
    const next = content?.trim() ?? '';
    if (!next) throw new BadRequestException('Message cannot be empty.');
    await this.prisma.message.update({ where: { id: messageId }, data: { content: next, editedAt: new Date() } });
    await this.applyMentions(channelId, messageId, next, actorId, true);
    return this.fetchMessage(messageId);
  }

  async deleteMessage(channelId: string, messageId: string) {
    const { channel, actorId } = await this.assertMember(channelId);
    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
      include: { attachments: { select: { documentId: true } } },
    });
    if (!msg) throw new NotFoundException('Message not found');
    // The author can delete their own; the channel owner can moderate any message.
    if (msg.userId !== actorId && channel.createdBy !== actorId) {
      throw new ForbiddenException('You can only delete your own messages.');
    }
    // Soft-delete: clear content + pin + reactions/mentions, leave a tombstone row.
    await this.prisma.$transaction([
      this.prisma.messageReaction.deleteMany({ where: { messageId } }),
      this.prisma.messageMention.deleteMany({ where: { messageId } }),
      this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), content: '', pinnedAt: null, pinnedBy: null } }),
    ]);
    if (msg.attachments.length) await this.documents.softDeleteAttached(msg.attachments.map(a => a.documentId));
    // If the message was a poll, remove the poll too (cascades options + votes).
    if (msg.pollId) await this.prisma.poll.delete({ where: { id: msg.pollId } }).catch(() => { /* already gone */ });
    return { ok: true };
  }

  /** Toggle one emoji reaction for the actor; returns the message's full reaction set. */
  async toggleReaction(channelId: string, messageId: string, emoji: string) {
    const { actorId } = await this.assertMember(channelId);
    if (!ALLOWED_EMOJI.has(emoji)) throw new BadRequestException('Unsupported reaction.');
    const msg = await this.prisma.message.findFirst({ where: { id: messageId, channelId, deletedAt: null }, select: { id: true } });
    if (!msg) throw new NotFoundException('Message not found');
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: actorId, emoji } },
    });
    if (existing) await this.prisma.messageReaction.delete({ where: { id: existing.id } });
    else await this.prisma.messageReaction.create({ data: { messageId, userId: actorId, emoji } });
    return this.prisma.messageReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
  }

  // ── polls ───────────────────────────────────────────────────────────────────
  private async fetchPollMessage(pollId: string) {
    const m = await this.prisma.message.findFirst({ where: { pollId }, include: MSG_INCLUDE });
    return m ? this.normalize(m) : null;
  }

  /** Post a poll into a channel — it becomes a message whose content is the question. */
  async createPoll(channelId: string, dto: { question: string; options: string[]; multiple?: boolean }) {
    const { channel, actorId } = await this.assertMember(channelId);
    if (channel.archivedAt) throw new BadRequestException('This discussion is archived and read-only.');
    const question = dto.question?.trim() ?? '';
    const opts = (dto.options ?? []).map(o => (o ?? '').trim()).filter(Boolean);
    if (!question) throw new BadRequestException('A poll needs a question.');
    if (opts.length < 2) throw new BadRequestException('A poll needs at least 2 options.');
    if (opts.length > 10) throw new BadRequestException('A poll can have at most 10 options.');
    const message = await this.prisma.$transaction(async (tx) => {
      const poll = await tx.poll.create({
        data: {
          channelId, createdBy: actorId, question, multiple: !!dto.multiple,
          options: { create: opts.map((text, i) => ({ text, sequence: i })) },
        },
      });
      return tx.message.create({ data: { channelId, userId: actorId, content: question, pollId: poll.id } });
    });
    return this.fetchMessage(message.id);
  }

  /** Cast (or change) the actor's vote. Single-choice replaces; multiple sets the given set. */
  async votePoll(channelId: string, pollId: string, optionIds: string[]) {
    const { actorId } = await this.assertMember(channelId);
    const poll = await this.prisma.poll.findFirst({ where: { id: pollId, channelId }, include: { options: { select: { id: true } } } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.closedAt) throw new BadRequestException('This poll is closed.');
    const valid = new Set(poll.options.map(o => o.id));
    let chosen = [...new Set((optionIds ?? []).filter(id => valid.has(id)))];
    if (!chosen.length) throw new BadRequestException('Pick at least one option.');
    if (!poll.multiple) chosen = [chosen[0]];
    await this.prisma.$transaction([
      this.prisma.pollVote.deleteMany({ where: { pollId, userId: actorId } }),
      this.prisma.pollVote.createMany({ data: chosen.map(optionId => ({ pollId, optionId, userId: actorId })) }),
    ]);
    return this.fetchPollMessage(pollId);
  }

  /** Close (or reopen) a poll — creator or channel owner only. */
  async closePoll(channelId: string, pollId: string) {
    const { channel, actorId } = await this.assertMember(channelId);
    const poll = await this.prisma.poll.findFirst({ where: { id: pollId, channelId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.createdBy !== actorId && channel.createdBy !== actorId) {
      throw new ForbiddenException('Only the poll creator or the discussion owner can close it.');
    }
    await this.prisma.poll.update({ where: { id: pollId }, data: { closedAt: poll.closedAt ? null : new Date() } });
    return this.fetchPollMessage(pollId);
  }

  async setPinned(channelId: string, messageId: string, pinned: boolean) {
    const { actorId } = await this.assertMember(channelId);
    const msg = await this.prisma.message.findFirst({ where: { id: messageId, channelId, deletedAt: null }, select: { id: true } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.prisma.message.update({
      where: { id: messageId },
      data: pinned ? { pinnedAt: new Date(), pinnedBy: actorId } : { pinnedAt: null, pinnedBy: null },
    });
    return this.fetchMessage(messageId);
  }

  // ── saved messages (personal bookmarks) ────────────────────────────────────
  async saveMessage(channelId: string, messageId: string) {
    const { actorId } = await this.assertMember(channelId);
    const msg = await this.prisma.message.findFirst({ where: { id: messageId, channelId, deletedAt: null }, select: { id: true } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.prisma.savedMessage.upsert({
      where: { userId_messageId: { userId: actorId, messageId } },
      create: { userId: actorId, messageId }, update: {},
    });
    return { saved: true };
  }

  async unsaveMessage(messageId: string) {
    const actorId = this.actor();
    await this.prisma.savedMessage.deleteMany({ where: { userId: actorId, messageId } });
    return { saved: false };
  }

  /** Messages the actor bookmarked, still visible (channel not deleted, still a member). */
  async listSaved() {
    const actorId = this.actor();
    const rows = await this.prisma.savedMessage.findMany({
      where: { userId: actorId, message: { deletedAt: null, channel: { deletedAt: null, members: { some: { userId: actorId } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { message: { include: { ...MSG_INCLUDE, channel: { select: { id: true, name: true } } } } },
    });
    return rows.map(r => ({ ...this.normalize(r.message), channel: (r.message as { channel: unknown }).channel, savedAt: r.createdAt }));
  }

  // ── read receipts ───────────────────────────────────────────────────────────
  /** Mark the channel read up to its latest message for the actor (drives unread + seen-by). */
  async markRead(channelId: string) {
    const { actorId } = await this.assertMember(channelId);
    const latest = await this.prisma.message.findFirst({
      where: { channelId, deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true },
    });
    await this.prisma.channelRead.upsert({
      where: { channelId_userId: { channelId, userId: actorId } },
      create: { channelId, userId: actorId, lastReadMessageId: latest?.id ?? null },
      update: { lastReadAt: new Date(), lastReadMessageId: latest?.id ?? null },
    });
    return { ok: true };
  }

  /** Per-member read state for this channel — the client derives "seen by" for own messages. */
  async listReads(channelId: string) {
    await this.assertMember(channelId);
    const reads = await this.prisma.channelRead.findMany({
      where: { channelId },
      select: { userId: true, lastReadAt: true },
    });
    return reads.map(r => ({ userId: r.userId, lastReadAt: r.lastReadAt }));
  }

  // ── governance: archive (owner-only) ────────────────────────────────────────
  /** Archive/unarchive a channel — owner only. Archived channels are read-only. */
  async setArchived(channelId: string, archived: boolean) {
    const { channel, actorId } = await this.assertOwner(channelId);
    await this.prisma.channel.update({
      where: { id: channel.id },
      data: archived ? { archivedAt: new Date(), archivedBy: actorId } : { archivedAt: null, archivedBy: null },
    });
    return { ok: true, archived };
  }

  // ── Member management (owner-only) ──────────────────────────────────────────
  async getMembers(channelId: string) {
    const { channel } = await this.assertMember(channelId);
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: { select: USER_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });
    return { ownerId: channel.createdBy, members };
  }

  async addMembers(channelId: string, userIds: string[]) {
    const { channel } = await this.assertOwner(channelId);
    const data = [...new Set(userIds.filter(Boolean))].map(userId => ({ channelId, userId }));
    if (data.length) {
      await this.prisma.channelMember.createMany({ data, skipDuplicates: true });
      const ch = await this.prisma.channel.findUnique({ where: { id: channel.id }, select: { name: true } });
      await this.notifications.notify(data.map(d => d.userId), {
        type: 'discussion.added', title: 'Added to a discussion',
        message: `You were added to the discussion "${ch?.name ?? ''}".`,
        link: `/discuss?channel=${channelId}`, channelId,
      });
    }
    return { ok: true, count: data.length };
  }

  async removeMember(channelId: string, userId: string) {
    const { channel } = await this.assertOwner(channelId);
    if (userId === channel.createdBy) throw new ForbiddenException('The owner cannot be removed from their own discussion.');
    await this.prisma.channelMember.deleteMany({ where: { channelId, userId } });
    return { ok: true };
  }
}

/**
 * Retention sweep: for channels with a retentionDays policy, tombstone messages older
 * than the window (same soft-delete shape as a manual delete — content/pin/reactions/
 * mentions cleared, attachments soft-deleted, polls removed — so the thread and any
 * deep links stay intact). Runs in-process on a timer, like the meeting reminder sweep.
 */
@Injectable()
export class ChannelRetentionService implements OnModuleInit {
  private readonly logger = new Logger(ChannelRetentionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  onModuleInit() {
    setTimeout(() => this.safeSweep(), 60_000);
    setInterval(() => this.safeSweep(), 6 * 60 * 60_000);
  }
  private async safeSweep() {
    try { await this.sweep(); } catch (e) { this.logger.warn(`channel retention sweep failed: ${String(e)}`); }
  }
  async sweep() {
    const channels = await this.prisma.channel.findMany({
      where: { deletedAt: null, retentionDays: { not: null } },
      select: { id: true, retentionDays: true },
    });
    const now = Date.now();
    let purged = 0;
    for (const c of channels) {
      const cutoff = new Date(now - (c.retentionDays ?? 0) * 24 * 60 * 60_000);
      const stale = await this.prisma.message.findMany({
        where: { channelId: c.id, deletedAt: null, createdAt: { lt: cutoff } },
        select: { id: true, pollId: true, attachments: { select: { documentId: true } } },
      });
      for (const m of stale) {
        await this.prisma.$transaction([
          this.prisma.messageReaction.deleteMany({ where: { messageId: m.id } }),
          this.prisma.messageMention.deleteMany({ where: { messageId: m.id } }),
          this.prisma.message.update({ where: { id: m.id }, data: { deletedAt: new Date(), content: '', pinnedAt: null, pinnedBy: null } }),
        ]);
        if (m.attachments.length) await this.documents.softDeleteAttached(m.attachments.map(a => a.documentId));
        if (m.pollId) await this.prisma.poll.delete({ where: { id: m.pollId } }).catch(() => { /* already gone */ });
        purged++;
      }
    }
    if (purged) this.logger.log(`retention: tombstoned ${purged} message(s) across ${channels.length} channel(s)`);
    return { purged };
  }
}
