-- Step-up "big change" passcode: argon2id hash of the org-wide passcode required
-- (on top of RBAC) for sensitive org/people/RBAC mutations. Additive and
-- backward-compatible — the guard is a no-op until the hash is set.

ALTER TABLE "organization" ADD COLUMN "securityPasscodeHash" TEXT;
