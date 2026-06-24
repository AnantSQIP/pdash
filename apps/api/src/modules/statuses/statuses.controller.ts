import { Controller, Get, Param, Query } from '@nestjs/common';
import { StatusesService } from './statuses.service';

@Controller('workflows')
export class StatusesController {
  constructor(private readonly statuses: StatusesService) {}

  @Get(':workflowId/statuses')
  list(@Param('workflowId') workflowId: string) {
    return this.statuses.listForWorkflow(workflowId);
  }

  @Get(':workflowId/statuses/default-open')
  defaultOpen(@Param('workflowId') workflowId: string) {
    return this.statuses.defaultOpenStatus(workflowId);
  }
}
