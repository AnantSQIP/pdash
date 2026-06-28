import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getActorId } from '../context/request-context';

/** Injects the current actor id (from the x-actor-id header) into a handler param. */
export const Actor = createParamDecorator((_data: unknown, _ctx: ExecutionContext): string | null => {
  return getActorId();
});
