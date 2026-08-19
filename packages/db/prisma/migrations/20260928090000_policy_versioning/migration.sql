-- Policy versioning — so an acknowledgement means something.
--
-- PolicyAcknowledgement recorded only WHO clicked and WHEN. Nothing recorded WHAT they agreed to.
-- HR could rewrite a policy from top to bottom and every prior acknowledgement still counted, so
-- "27 people have accepted the leave policy" could mean 27 people accepted a different document.
-- For the one feature whose entire purpose is a record of agreement, that is the wrong answer.
--
-- The version is bumped only when the BODY or the attached document changes. Renaming a policy or
-- correcting its category is not a change of terms, and must not invalidate consent people
-- genuinely gave.
--
-- Additive, and existing data reads correctly without being touched: every policy starts at
-- version 1 and every acknowledgement recorded so far was, by definition, against version 1.

ALTER TABLE "policy" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "policy_acknowledgement" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
