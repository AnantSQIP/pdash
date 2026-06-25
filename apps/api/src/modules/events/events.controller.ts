import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto';

@Controller('calendar-events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(
    @Query('organizationId') organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.events.list(organizationId, from, to);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.events.get(id);
  }

  @Post()
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.events.softDelete(id);
  }
}
