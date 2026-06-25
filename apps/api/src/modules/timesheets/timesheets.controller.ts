import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { CreateTimesheetDto, UpdateTimesheetDto } from './dto';

@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
  ) {
    if (projectId) return this.timesheets.listForProject(projectId);
    if (userId) return this.timesheets.listForUser(userId);
    return [];
  }

  @Post()
  create(@Body() dto: CreateTimesheetDto) {
    return this.timesheets.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTimesheetDto) {
    return this.timesheets.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.timesheets.softDelete(id);
  }
}
