import { Controller, Get, Param, Query } from '@nestjs/common';
import { StatusesService } from './statuses.service';

@Controller('workflows')
export class StatusesController {
  constructor(private readonly statuses: StatusesService) {}

  // NOTE: GET :workflowId/statuses is served by WorkflowsController.listStatuses
  // (registered first and therefore the live handler). The duplicate was removed
  // here to avoid a shadowed, never-executed route. This controller keeps the
  // unique default-open route below.

  @Get(':workflowId/statuses/default-open')
  defaultOpen(@Param('workflowId') workflowId: string) {
    return this.statuses.defaultOpenStatus(workflowId);
  }
}
