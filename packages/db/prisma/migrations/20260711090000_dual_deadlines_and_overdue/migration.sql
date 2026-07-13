-- Dual deadlines (internal + client) and overdue-alert tracking.
--
--   <table>.dueDate        = the INTERNAL deadline (unchanged; visible to everyone,
--                            drives "overdue" and the alerts below).
--   <table>.clientDueDate  = the date committed to the CLIENT. Restricted — the API
--                            redacts it for actors without deadline.view.client (a
--                            project's own MANAGER always sees it for that project).
--   task.overdueNotifiedAt = set when an overdue alert was sent; cleared when the
--                            internal deadline moves forward, so a slip alerts once.
--
-- Additive and backward-compatible: existing rows keep their internal deadline and
-- simply have no client deadline until one is set.

ALTER TABLE "project" ADD COLUMN     "clientDueDate" TIMESTAMP(3);

ALTER TABLE "task" ADD COLUMN     "clientDueDate" TIMESTAMP(3),
ADD COLUMN     "overdueNotifiedAt" TIMESTAMP(3);
