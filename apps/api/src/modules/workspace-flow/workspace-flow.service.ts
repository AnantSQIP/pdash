import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getActorId } from '../../common/context/request-context';
import type { WorkspaceFlow } from '../../common/decorators/require-flow.decorator';

export type { WorkspaceFlow } from '../../common/decorators/require-flow.decorator';

/**
 * Which workspace flow an organisation runs — PROJECTS or CLIENTS (docs/WORKSPACE_FLOWS.md).
 *
 * The single place the question is answered. Code that behaves differently per flow asks here
 * rather than reading the column, so every guard and branch gets the same answer. Cached for a few
 * seconds: the flow changes perhaps once in a firm's life, is asked on almost every request, and a
 * conversion drops the cache the moment it commits.
 *
 * Changing the flow is NOT done here — it is a conversion (WorkspaceFlowConversionService).
 */
@Injectable()
export class WorkspaceFlowService {
  private readonly byOrg = new Map<string, { flow: WorkspaceFlow; at: number }>();
  private readonly orgOfUser = new Map<string, string>();
  private static readonly TTL_MS = 5_000;

  constructor(private readonly prisma: PrismaService) {}

  async flowOf(organizationId: string | null | undefined): Promise<WorkspaceFlow> {
    if (!organizationId) return 'PROJECTS';
    const hit = this.byOrg.get(organizationId);
    if (hit && Date.now() - hit.at < WorkspaceFlowService.TTL_MS) return hit.flow;
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { workspaceFlow: true },
    });
    // Anything but CLIENTS — including a missing row — is PROJECTS: what every firm ran before
    // flows existed, and the flow whose rules are the more permissive about missing data.
    const flow: WorkspaceFlow = org?.workspaceFlow === 'CLIENTS' ? 'CLIENTS' : 'PROJECTS';
    this.byOrg.set(organizationId, { flow, at: Date.now() });
    return flow;
  }

  async isClients(organizationId: string | null | undefined): Promise<boolean> {
    return (await this.flowOf(organizationId)) === 'CLIENTS';
  }

  /** The flow of the organisation a user belongs to. */
  async flowOfUser(userId: string | null | undefined): Promise<WorkspaceFlow> {
    if (!userId) return 'PROJECTS';
    let org = this.orgOfUser.get(userId);
    if (!org) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
      org = u?.organizationId ?? undefined;
      if (org) this.orgOfUser.set(userId, org);
    }
    return this.flowOf(org);
  }

  /** The flow of whoever is making the current request. */
  async currentFlow(): Promise<WorkspaceFlow> {
    return this.flowOfUser(getActorId());
  }

  async currentIsClients(): Promise<boolean> {
    return (await this.currentFlow()) === 'CLIENTS';
  }

  /** Forget a cached answer — called by a conversion the moment it commits. */
  forget(organizationId: string) {
    this.byOrg.delete(organizationId);
  }
}

@Global()
@Module({
  providers: [WorkspaceFlowService],
  exports: [WorkspaceFlowService],
})
export class WorkspaceFlowModule {}
