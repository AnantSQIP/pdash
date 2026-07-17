-- Billable review: an admin decides whether each new project's work is billable.
-- Project.billable: null = undecided (admin notified to set it), true/false once decided.
-- Notification.link: optional in-app destination so a notification can be clicked through.

ALTER TABLE "project" ADD COLUMN "billable" BOOLEAN;
ALTER TABLE "notification" ADD COLUMN "link" TEXT;
