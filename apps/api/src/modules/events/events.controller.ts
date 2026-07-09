import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('calendar-events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get() @RequirePermission('calendar.view')
  list(
    @Query('organizationId') organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.events.list(organizationId, from, to);
  }

  @Get(':id') @RequirePermission('calendar.view')
  get(@Param('id') id: string) {
    return this.events.get(id);
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
