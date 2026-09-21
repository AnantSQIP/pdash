import type { WorkspaceFlow } from './decorators/require-flow.decorator';

/**
 * Features that exist in one workspace flow only (docs/WORKSPACE_FLOWS.md).
 *
 * PATENTS AND CLIENT CODES — three things the PROJECTS flow has and the CLIENTS flow does not:
 *
 *   • the patent portal (/patents, and the client ledger that lives in the same API module),
 *   • patent IDs — patent handles, real numbers, tagging and lookup,
 *   • client IDs — the client codes and the client picker that named a project's client.
 *
 * They are ON for an organisation in PROJECTS (exactly as production runs them) and OFF in CLIENTS,
 * where the owner asked for them to be switched off when projects became clients. The routes that
 * serve them carry @RequireFlow('PROJECTS'); shared code asks here with the organisation's flow.
 * The web asks the same question (apps/web/lib/features.ts).
 */
export function patentsAndClientCodes(flow: WorkspaceFlow): boolean {
  return flow === 'PROJECTS';
}
