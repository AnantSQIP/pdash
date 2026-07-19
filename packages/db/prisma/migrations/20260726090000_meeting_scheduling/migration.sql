-- Meeting scheduling: location + external join link + reminders on events, and an
-- RSVP response on each attendee. No built-in video — the join link points at whatever
-- external tool (Meet/Zoom/Teams) the organizer uses.

ALTER TABLE "calendar_event" ADD COLUMN "location" TEXT;
ALTER TABLE "calendar_event" ADD COLUMN "joinUrl" TEXT;
ALTER TABLE "calendar_event" ADD COLUMN "reminderMinutes" INTEGER;
ALTER TABLE "calendar_event" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

ALTER TABLE "calendar_event_attendee" ADD COLUMN "response" TEXT NOT NULL DEFAULT 'PENDING';
