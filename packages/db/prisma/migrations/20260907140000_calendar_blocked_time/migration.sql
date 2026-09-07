-- Blocked time: a period a person has marked themselves unavailable.
--
-- Its own table rather than a CalendarEvent with a special type. An event carries attendees,
-- a join link, reminders and recurrence — none of which mean anything for an absence of
-- availability, and it would appear in meeting lists as something joinable.
--
-- `reason` is for the owner alone. Free/busy reports "Unavailable" and never this column:
-- a colleague needs to know you are busy between two times, not what you are doing.
CREATE TABLE "calendar_block" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "startsAt"  TIMESTAMP(3) NOT NULL,
    "endsAt"    TIMESTAMP(3) NOT NULL,
    "reason"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calendar_block_pkey" PRIMARY KEY ("id")
);

-- Free/busy asks "whose blocks overlap this window" on every scheduling lookup.
CREATE INDEX "calendar_block_userId_startsAt_idx" ON "calendar_block"("userId", "startsAt");

ALTER TABLE "calendar_block" ADD CONSTRAINT "calendar_block_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
