import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto } from './dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const { attendeeIds = [], ...rest } = dto;
    return this.prisma.calendarEvent.create({
      data: {
        ...rest,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        attendees: attendeeIds.length
          ? { create: attendeeIds.map(userId => ({ userId })) }
          : undefined,
      },
      include: { attendees: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    });
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.get(id);
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { attendees: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    });
  }

  async softDelete(id: string) {
    await this.get(id);
    return this.prisma.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
