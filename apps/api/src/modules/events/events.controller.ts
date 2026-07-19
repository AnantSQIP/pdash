import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto, RespondDto } from './dto';
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

  @Delete(':id') @RequirePermission('calendar.update')
  remove(@Param('id') id: string) {
    return this.events.softDelete(id);
  }
}
