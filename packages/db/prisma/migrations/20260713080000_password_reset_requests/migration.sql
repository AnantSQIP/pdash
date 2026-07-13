-- A user who cannot sign in has no way to reach anyone: there is no mail transport, so no
-- password-reset email is possible. This column is how they raise their hand — the login
-- page writes it, and an admin sees the pending request and resets them.
--
-- Additive and nullable: existing rows are simply "no request outstanding".
ALTER TABLE "user" ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3);
