import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto, RespondDto, NotesDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

@Controller('calendar-events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly actor: ActorContextService,
  ) {}

  @Get() @RequirePermission('calendar.view')
  list(
    @Query('organizationId') organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.events.list(organizationId, from, to);
  }

  // Scheduling assistant: free/busy for the given people over a window. Org from session.
  @Get('free-busy') @RequirePermission('calendar.view')
  async freeBusy(
    @Query('userIds') userIds: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.events.freeBusy(await this.actor.requireOrgId(), (userIds ?? '').split(',').filter(Boolean), from, to);
  }

  // iCalendar download of the org's events (session-scoped org).
  @Get('export.ics') @RequirePermission('calendar.view')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="squark-calendar.ics"')
  async exportIcs() {
    return this.events.exportIcs(await this.actor.requireOrgId());
  }

  @Get(':id') @RequirePermission('calendar.view')
  get(@Param('id') id: string) {
    return this.events.get(id);
  }

  // Any invited attendee may RSVP (enforced in the service).
  @Post(':id/respond') @RequirePermission('calendar.view')
  respond(@Param('id') id: string, @Body() dto: RespondDto) {
    return this.events.respond(id, dto.response);
  }

  @Post() @RequirePermission('calendar.create')
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto);
  }

  // update/delete additionally require the caller to be the organizer (or Super Admin);
  // enforced in the service.
  @Patch(':id') @RequirePermission('calendar.update')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(id, dto);
  }

  // Notes are collaborative — any attendee (or the organizer) may edit; enforced in the service.
  @Put(':id/notes') @RequirePermission('calendar.view')
  updateNotes(@Param('id') id: string, @Body() dto: NotesDto) {
    return this.events.updateNotes(id, dto.notes);
  }

  @Delete(':id') @RequirePermission('calendar.update')
  remove(@Param('id') id: string, @Query('series') series?: string) {
    return this.events.softDelete(id, series === 'true');
  }
}
