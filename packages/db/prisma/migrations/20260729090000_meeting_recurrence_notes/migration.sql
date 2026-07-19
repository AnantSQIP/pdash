-- Recurring meetings (materialized occurrences linked to a series master) and shared
-- collaborative meeting notes.

ALTER TABLE "calendar_event" ADD COLUMN "recurrence" TEXT;
ALTER TABLE "calendar_event" ADD COLUMN "recurrenceUntil" TIMESTAMP(3);
ALTER TABLE "calendar_event" ADD COLUMN "recurrenceParentId" TEXT;
ALTER TABLE "calendar_event" ADD COLUMN "notes" TEXT;
CREATE INDEX "calendar_event_recurrenceParentId_idx" ON "calendar_event"("recurrenceParentId");
