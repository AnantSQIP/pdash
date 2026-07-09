import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ApprovalDto, CreateProjectDto, UpdateProjectDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post() @RequirePermission('project.create')
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Get()
  list(@Query('organizationId') organizationId: string, @Query('phase') phase?: string) {
    return this.projects.list(organizationId, { phase });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Patch(':id') @RequirePermission('project.update')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Post(':id/members') @RequirePermission('project.update')
  addMember(@Param('id') id: string, @Body() body: { userId: string; projectRole?: string }) {
    return this.projects.addMember(id, body.userId, body.projectRole);
  }

  @Delete(':id/members/:userId') @RequirePermission('project.update')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(id, userId);
  }

  @Post(':id/approve') @RequirePermission('project.approve')
  approve(@Param('id') id: string, @Body() dto: ApprovalDto) {
    return this.projects.decide(id, true, dto);
  }

  @Post(':id/reject') @RequirePermission('project.approve')
  reject(@Param('id') id: string, @Body() dto: ApprovalDto) {
    return this.projects.decide(id, false, dto);
  }

  @Delete(':id') @RequirePermission('project.delete')
  remove(@Param('id') id: string) {
    return this.projects.softDelete(id);
  }
}
