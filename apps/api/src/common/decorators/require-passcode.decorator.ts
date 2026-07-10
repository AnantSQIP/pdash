import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PASSCODE_KEY = 'require_passcode';

/**
 * Marks a route as a "big change" that requires the organization step-up passcode
 * (on top of RBAC). Enforced by PasscodeGuard, which reads the `x-org-passcode`
 * header and verifies it against Organization.securityPasscodeHash. No-op until a
 * passcode is configured for the org. Example: @RequirePasscode() on user.create.
 */
export const RequirePasscode = () => SetMetadata(REQUIRE_PASSCODE_KEY, true);
