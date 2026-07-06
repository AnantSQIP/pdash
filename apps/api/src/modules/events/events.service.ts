import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.module';
import { getActorId } from '../../common/context/request-context';
import { CreateEventDto, UpdateEventDto } from './dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
    const { attendeeIds = [], createdBy: _ignored, ...rest } = dto;
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const event = await this.prisma.calendarEvent.create({
      data: {
        ...rest,
        createdBy: actorId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
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
    return event;
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.get(id);
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

  async softDelete(id: string) {
    await this.get(id);
    return this.prisma.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
