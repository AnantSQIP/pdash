import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { CreateIssueDto, UpdateIssueDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller('issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  list(@Query('projectId') projectId: string, @Query('status') status?: string) {
    return this.issues.list(projectId, status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.issues.get(id);
  }

  @Post() @RequirePermission('issue.create')
  create(@Body() dto: CreateIssueDto) {
    return this.issues.create(dto);
  }

  @Patch(':id') @RequirePermission('issue.update')
  update(@Param('id') id: string, @Body() dto: UpdateIssueDto) {
    return this.issues.update(id, dto);
  }

  @Delete(':id') @RequirePermission('issue.delete')
  remove(@Param('id') id: string) {
    return this.issues.softDelete(id);
  }
}
