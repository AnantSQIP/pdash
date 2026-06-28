import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

/**
 * Marks a route as requiring one (or any-of several) permission codes.
 * Enforced by PermissionGuard. Example: @RequirePermission('project.create')
 */
export const RequirePermission = (...codes: string[]) => SetMetadata(REQUIRE_PERMISSION_KEY, codes);
