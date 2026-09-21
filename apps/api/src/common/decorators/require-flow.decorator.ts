import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FLOW_KEY = 'require_flow';

/** The two ways an organisation can run the firm — see docs/WORKSPACE_FLOWS.md. */
export type WorkspaceFlow = 'PROJECTS' | 'CLIENTS';
export const WORKSPACE_FLOWS: WorkspaceFlow[] = ['PROJECTS', 'CLIENTS'];

/**
 * A route that exists in only one workspace flow. In the other flow it answers 404 — as if it were
 * not there, because for that organisation it is not. Enforced by FlowGuard (global, opt-in: a
 * route without this decorator serves both flows). Put it on a controller to cover every route.
 *
 *   @RequireFlow('CLIENTS')  // client groups, CID ledger, Team Capacity task CRUD, billable per task
 *   @RequireFlow('PROJECTS') // PID generation and requests, the patent portal, the timer
 */
export const RequireFlow = (flow: WorkspaceFlow) => SetMetadata(REQUIRE_FLOW_KEY, flow);
