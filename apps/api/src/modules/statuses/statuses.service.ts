import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StatusesService {
  constructor(private readonly prisma: PrismaService) {}

  listForWorkflow(workflowId: string) {
    return this.prisma.workflowStatus.findMany({
      where: { workflowId },
      orderBy: { sequence: 'asc' },
    });
  }

  async get(id: string) {
    const status = await this.prisma.workflowStatus.findUnique({ where: { id } });
    if (!status) throw new NotFoundException(`WorkflowStatus ${id} not found`);
    return status;
  }

  /** First OPEN status in a workflow, used as default for new tasks. */
  async defaultOpenStatus(workflowId: string) {
    const status = await this.prisma.workflowStatus.findFirst({
      where: { workflowId, type: 'OPEN' },
      orderBy: { sequence: 'asc' },
    });
    if (!status) throw new NotFoundException(`No OPEN status in workflow ${workflowId}. Seed default workflow first.`);
    return status;
  }
}
