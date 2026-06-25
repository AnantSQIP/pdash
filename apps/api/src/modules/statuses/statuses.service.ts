import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StatusesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveWorkflowId(workflowId: string): Promise<string> {
    if (workflowId === 'default' || workflowId === 'workflow-default') {
      const workflow = await this.prisma.workflow.findFirst({
        where: { type: 'GLOBAL' },
        orderBy: { name: 'asc' },
      });
      if (!workflow) throw new NotFoundException('No GLOBAL workflow found. Run seed first.');
      return workflow.id;
    }
    return workflowId;
  }

  async listForWorkflow(workflowId: string) {
    const id = await this.resolveWorkflowId(workflowId);
    return this.prisma.workflowStatus.findMany({
      where: { workflowId: id },
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
    const id = await this.resolveWorkflowId(workflowId);
    const status = await this.prisma.workflowStatus.findFirst({
      where: { workflowId: id, type: 'OPEN' },
      orderBy: { sequence: 'asc' },
    });
    if (!status) throw new NotFoundException(`No OPEN status in workflow ${workflowId}. Seed default workflow first.`);
    return status;
  }
}
