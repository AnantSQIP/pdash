import { AsyncLocalStorage } from 'node:async_hooks';

export interface ActorContext {
  actorId: string | null;
  ip?: string | null;
}

/**
 * Per-request actor context. Populated by CurrentActorMiddleware from the
 * `x-actor-id` header (interim identity until JWT auth lands) and read by the
 * PermissionGuard and EventService.
 */
export const requestContext = new AsyncLocalStorage<ActorContext>();

/** Current actor id for this request, or null if unauthenticated. */
export function getActorId(): string | null {
  return requestContext.getStore()?.actorId ?? null;
}

export function getActorIp(): string | null {
  return requestContext.getStore()?.ip ?? null;
}
