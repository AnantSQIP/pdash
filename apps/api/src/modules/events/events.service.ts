import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PermissionService } from '../permissions/permission.service';
import { getActorId } from '../../common/context/request-context';
import { CreateEventDto, UpdateEventDto } from './dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionService,
  ) {}

  /** Only the organizer (createdBy) or a Super Admin may modify/delete an event. */
  private async assertOrganizerOrPrivileged(createdBy: string) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    if (actorId === createdBy) return;
    const perms = await this.permissions.getEffectivePermissions(actorId);
    if (!perms.isSuperAdmin) throw new ForbiddenException('Only the organizer can modify this event.');
  }

  private formatWhen(d: Date, allDay?: boolean) {
    return allDay
      ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' } as Intl.DateTimeFormatOptions)
      : new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  list(organizationId: string, from?: string, to?: string) {
    return this.prisma.calendarEvent.findMany({
      where: {
        organizationId,
        deletedAt: null,
        startDate: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { attendees: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
      orderBy: { startDate: 'asc' },
    });
  }

  async get(id: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, deletedAt: null },
      include: { attendees: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return event;
  }

  async create(dto: CreateEventDto) {
    // Organizer = verified actor (never the client-supplied createdBy).
    const { attendeeIds = [], createdBy: _ignored, recurrence, recurrenceUntil, ...rest } = dto;
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const event = await this.prisma.calendarEvent.create({
      data: {
        ...rest,
        createdBy: actorId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        // Mark the master with its recurrence rule; occurrences are generated below.
        recurrence: recurrence && recurrence !== 'NONE' ? recurrence : undefined,
        recurrenceUntil: recurrenceUntil ? new Date(recurrenceUntil) : undefined,
        attendees: attendeeIds.length
          ? { create: attendeeIds.map(userId => ({ userId })) }
          : undefined,
      },
      include: { attendees: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    });
    // Notify everyone added to the meeting (the organizer is excluded automatically).
    if (attendeeIds.length) {
      const organizer = await this.prisma.user.findUnique({ where: { id: event.createdBy }, select: { firstName: true, lastName: true } });
      const who = organizer ? `${organizer.firstName} ${organizer.lastName ?? ''}`.trim() : 'Someone';
      await this.notifications.notify(attendeeIds, {
        type: 'meeting.invited',
        title: 'New meeting',
        message: `${who} added you to "${event.title}" on ${this.formatWhen(event.startDate, event.allDay)}.`,
      });
    }
    if (recurrence && recurrence !== 'NONE') await this.generateOccurrences(event, recurrence, recurrenceUntil, attendeeIds);
    return event;
  }

  private nextDate(d: Date, rule: string): Date {
    const r = new Date(d);
    if (rule === 'DAILY') r.setUTCDate(r.getUTCDate() + 1);
    else if (rule === 'WEEKLY') r.setUTCDate(r.getUTCDate() + 7);
    else if (rule === 'BIWEEKLY') r.setUTCDate(r.getUTCDate() + 14);
    else if (rule === 'MONTHLY') r.setUTCMonth(r.getUTCMonth() + 1);
    return r;
  }

  /** Materialize repeat occurrences after the master (capped), each linked to the series. */
  private async generateOccurrences(master: { id: string; organizationId: string; title: string; description: string | null; type: string; allDay: boolean; color: string; location: string | null; joinUrl: string | null; reminderMinutes: number | null; notes: string | null; projectId: string | null; createdBy: string; startDate: Date; endDate: Date | null }, rule: string, untilStr: string | undefined, attendeeIds: string[]) {
    const start = new Date(master.startDate);
    const durationMs = master.endDate ? new Date(master.endDate).getTime() - start.getTime() : 0;
    const until = untilStr ? new Date(untilStr) : this.nextDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, start.getUTCDate())), 'DAILY');
    const MAX = 60;
    const creates = [];
    let cur = this.nextDate(start, rule);
    let count = 0;
    while (cur <= until && count < MAX) {
      const occStart = new Date(cur);
      creates.push(this.prisma.calendarEvent.create({
        data: {
          organizationId: master.organizationId, title: master.title, description: master.description ?? undefined,
          type: master.type, allDay: master.allDay, color: master.color,
          location: master.location ?? undefined, joinUrl: master.joinUrl ?? undefined,
          reminderMinutes: master.reminderMinutes ?? undefined, notes: master.notes ?? undefined,
          projectId: master.projectId ?? undefined, createdBy: master.createdBy,
          startDate: occStart, endDate: durationMs ? new Date(occStart.getTime() + durationMs) : undefined,
          recurrenceParentId: master.id,
          attendees: attendeeIds.length ? { create: attendeeIds.map(userId => ({ userId })) } : undefined,
        },
      }));
      cur = this.nextDate(cur, rule);
      count++;
    }
    if (creates.length) await this.prisma.$transaction(creates);
  }

  async update(id: string, dto: UpdateEventDto) {
    const existing = await this.get(id);
    await this.assertOrganizerOrPrivileged(existing.createdBy);
    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { attendees: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    });
    // Tell attendees the meeting changed (e.g. rescheduled).
    const attendeeIds = event.attendees.map(a => a.userId);
    if (attendeeIds.length) {
      await this.notifications.notify(attendeeIds, {
        type: 'meeting.updated',
        title: 'Meeting updated',
        message: `"${event.title}" was updated — now ${this.formatWhen(event.startDate, event.allDay)}.`,
      });
    }
    return event;
  }

  async softDelete(id: string, series = false) {
    const existing = await this.get(id);
    await this.assertOrganizerOrPrivileged(existing.createdBy);
    if (series) {
      // Delete the whole series: the master + every occurrence linked to it.
      const rootId = existing.recurrenceParentId ?? id;
      await this.prisma.calendarEvent.updateMany({
        where: { OR: [{ id: rootId }, { recurrenceParentId: rootId }] },
        data: { deletedAt: new Date() },
      });
      return { ok: true };
    }
    return this.prisma.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Shared meeting notes — editable by the organizer or any attendee (or a Super Admin). */
  async updateNotes(id: string, notes: string) {
    const event = await this.get(id);
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const isAttendee = event.attendees.some(a => a.userId === actorId);
    if (actorId !== event.createdBy && !isAttendee) {
      const perms = await this.permissions.getEffectivePermissions(actorId);
      if (!perms.isSuperAdmin) throw new ForbiddenException('Only the organizer or an attendee can edit the notes.');
    }
    return this.prisma.calendarEvent.update({
      where: { id },
      data: { notes: (notes ?? '').slice(0, 8000) },
      include: { attendees: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    });
  }

  /** iCalendar export of the org's events in a ±window (download / subscribe). */
  async exportIcs(organizationId: string): Promise<string> {
    const now = Date.now();
    const from = new Date(now - 30 * 86_400_000);
    const to = new Date(now + 120 * 86_400_000);
    const events = await this.prisma.calendarEvent.findMany({
      where: { organizationId, deletedAt: null, startDate: { gte: from, lte: to } },
      orderBy: { startDate: 'asc' },
    });
    const fmt = (d: Date) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s: string | null) => (s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Squark Dashboard//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of events) {
      lines.push('BEGIN:VEVENT', `UID:${e.id}@squark-dashboard`, `DTSTAMP:${fmt(e.createdAt)}`);
      if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${fmt(e.startDate).slice(0, 8)}`);
      else {
        lines.push(`DTSTART:${fmt(e.startDate)}`);
        if (e.endDate) lines.push(`DTEND:${fmt(e.endDate)}`);
      }
      lines.push(`SUMMARY:${esc(e.title)}`);
      if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
      if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
      if (e.joinUrl) lines.push(`URL:${esc(e.joinUrl)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  /** An attendee RSVPs to a meeting; the organizer is notified. */
  async respond(id: string, response: string) {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const att = await this.prisma.calendarEventAttendee.findUnique({ where: { eventId_userId: { eventId: id, userId: actorId } } });
    if (!att) throw new ForbiddenException('You are not invited to this meeting.');
    await this.prisma.calendarEventAttendee.update({ where: { id: att.id }, data: { response } });
    const event = await this.prisma.calendarEvent.findFirst({ where: { id, deletedAt: null }, select: { title: true, createdBy: true } });
    if (event) {
      const me = await this.prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
      const who = me ? `${me.firstName} ${me.lastName ?? ''}`.trim() : 'Someone';
      const verb = response === 'ACCEPTED' ? 'accepted' : response === 'DECLINED' ? 'declined' : response === 'TENTATIVE' ? 'tentatively accepted' : 'updated their RSVP to';
      await this.notifications.notify(event.createdBy, {
        type: 'meeting.rsvp', title: 'Meeting RSVP',
        message: `${who} ${verb} "${event.title}".`, link: '/calendar',
      });
    }
    return this.get(id);
  }

  /**
   * Free/busy for a set of people over a window — the scheduling assistant. "Busy" is
   * any calendar event they organize or attend that day, plus approved leave. Used to
   * pick a conflict-free time before sending the invite.
   */
  async freeBusy(organizationId: string, userIds: string[], from: string, to: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return [];
    const fromD = new Date(from);
    const toD = new Date(to);
    const [events, leaves] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          organizationId, deletedAt: null,
          startDate: { gte: fromD, lte: toD },
          OR: [{ createdBy: { in: ids } }, { attendees: { some: { userId: { in: ids } } } }],
        },
        select: { title: true, startDate: true, endDate: true, allDay: true, createdBy: true, attendees: { select: { userId: true } } },
      }),
      this.prisma.leaveRequest.findMany({
        where: { userId: { in: ids }, status: 'APPROVED', startDate: { lte: toD }, endDate: { gte: fromD } },
        select: { userId: true, startDate: true, endDate: true, leaveType: true },
      }),
    ]);
    const busy = new Map<string, { start: string; end: string; title: string; allDay: boolean }[]>();
    ids.forEach(id => busy.set(id, []));
    for (const e of events) {
      const end = (e.endDate ?? new Date(e.startDate.getTime() + 30 * 60_000)).toISOString();
      const on = new Set<string>();
      if (ids.includes(e.createdBy)) on.add(e.createdBy);
      e.attendees.forEach(a => { if (ids.includes(a.userId)) on.add(a.userId); });
      on.forEach(uid => busy.get(uid)!.push({ start: e.startDate.toISOString(), end, title: e.title, allDay: e.allDay }));
    }
    for (const l of leaves) {
      busy.get(l.userId)?.push({ start: l.startDate.toISOString(), end: l.endDate.toISOString(), title: `${l.leaveType} leave`, allDay: true });
    }
    return ids.map(userId => ({ userId, busy: busy.get(userId) ?? [] }));
  }
}

/**
 * Sends "meeting starting soon" notifications. In-process sweep (single-container
 * deployment) every 5 minutes: any event whose reminder window has arrived and hasn't
 * been reminded yet notifies its organizer + attendees exactly once.
 */
@Injectable()
export class MeetingReminderService implements OnModuleInit {
  private readonly logger = new Logger(MeetingReminderService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    setTimeout(() => this.safeSweep(), 30_000);
    setInterval(() => this.safeSweep(), 5 * 60_000);
  }
  private async safeSweep() {
    try { await this.sweep(); } catch (e) { this.logger.warn(`meeting reminder sweep failed: ${String(e)}`); }
  }
  async sweep() {
    const now = new Date();
    const events = await this.prisma.calendarEvent.findMany({
      where: { deletedAt: null, reminderMinutes: { not: null }, reminderSentAt: null, startDate: { gt: now } },
      include: { attendees: { select: { userId: true } } },
    });
    for (const e of events) {
      const remindAt = new Date(e.startDate.getTime() - (e.reminderMinutes ?? 0) * 60_000);
      if (remindAt > now) continue; // window not reached yet
      const when = new Date(e.startDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      await this.notifications.notify([e.createdBy, ...e.attendees.map(a => a.userId)], {
        type: 'meeting.reminder', title: 'Meeting starting soon',
        message: `"${e.title}" starts ${when}.`, link: '/calendar',
      });
      await this.prisma.calendarEvent.update({ where: { id: e.id }, data: { reminderSentAt: now } });
    }
  }
}
