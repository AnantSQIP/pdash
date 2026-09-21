import { ValidationPipe, type Type } from '@nestjs/common';

/**
 * Validate a request body against a DTO class chosen at run time — for a route that exists in both
 * workspace flows but accepts a different body in each (docs/WORKSPACE_FLOWS.md).
 *
 * Such a route declares `@Body() body: unknown`, which the global ValidationPipe passes through
 * untouched (it validates only class-typed bodies), and then calls this with the class of the
 * caller's flow. The options are the global pipe's exactly (main.ts), so the refusal a caller gets
 * — status, message list, whitelist behaviour — is the one the route gave when it had one DTO.
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

export function validateBody<T>(cls: Type<T>, body: unknown): Promise<T> {
  return pipe.transform(body, { type: 'body', metatype: cls }) as Promise<T>;
}
