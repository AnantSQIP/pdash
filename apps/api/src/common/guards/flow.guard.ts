import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_FLOW_KEY, type WorkspaceFlow } from '../decorators/require-flow.decorator';
import { getActorId } from '../context/request-context';
import { WorkspaceFlowService } from '../../modules/workspace-flow/workspace-flow.service';

/**
 * Global and OPT-IN: a route with @RequireFlow(x) is served only to an organisation running flow x
 * and answers 404 to the other — the route does not exist in that flow, so it must not even admit
 * to being forbidden. Runs after AuthGuard (an anonymous caller has no organisation to ask about).
 */
@Injectable()
export class FlowGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flows: WorkspaceFlowService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<WorkspaceFlow | undefined>(REQUIRE_FLOW_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const actorId = getActorId();
    if (!actorId) return true; // AuthGuard already refused, or the route is public
    const flow = await this.flows.flowOfUser(actorId);
    if (flow !== required) {
      const req = ctx.switchToHttp().getRequest();
      throw new NotFoundException(`Cannot ${req?.method ?? 'GET'} ${req?.originalUrl ?? req?.url ?? ''}`);
    }
    return true;
  }
}
