-- Task timing, and expected hours learned from what tasks actually take.
--
-- Additive only: nothing is dropped and nothing existing changes meaning. Tasks already
-- closed have no sessions and contribute nothing to the averages, which is correct — the
-- system knows how long a task takes only once it has been timed.

ALTER TABLE "task" ADD COLUMN "startedAt" TIMESTAMP(3);
-- Reopening is normal in patent work; if it is not recorded, the hours and every figure
-- derived from them understate what the task cost.
ALTER TABLE "task" ADD COLUMN "reopenedCount" INTEGER NOT NULL DEFAULT 0;

-- What each person confirmed for THEIR part, and which standard it fed.
--
-- On the assignment rather than the task because the analyst's six hours and the reviewer's
-- two are facts about two different kinds of work. standardKey survives a task being
-- renamed after completion; standardMinutes lets a re-completion post only the difference,
-- so one person's part counts once at its final total however often the task is reopened.
ALTER TABLE "task_assignee" ADD COLUMN "confirmedHours" DOUBLE PRECISION;
ALTER TABLE "task_assignee" ADD COLUMN "standardKey" TEXT;
ALTER TABLE "task_assignee" ADD COLUMN "standardMinutes" INTEGER;

-- One stretch of work: Start pressed, Stop pressed. A task is worked in several sittings,
-- by more than one person, and again after being reopened — a row per sitting records all
-- three, where a pair of columns on the task could record none of them.
CREATE TABLE "task_work_session" (
    "id"        TEXT NOT NULL,
    "taskId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt"   TIMESTAMP(3),
    "minutes"   INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_work_session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_work_session_taskId_idx" ON "task_work_session"("taskId");
-- Finding a person's RUNNING session happens on every load of My Tasks.
CREATE INDEX "task_work_session_userId_endedAt_idx" ON "task_work_session"("userId", "endedAt");

ALTER TABLE "task_work_session" ADD CONSTRAINT "task_work_session_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_work_session" ADD CONSTRAINT "task_work_session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- How long a standard task takes, per ROLE, learned from every completion of it anywhere.
--
-- Per role because the firm's three questions need different answers: a client deadline and
-- an invoice need the WHOLE task, analyst plus review, while judging an analyst against a
-- figure containing somebody else's review flatters them. The task total is the sum across
-- the roles staffing it.
--
-- totalMinutes and completions are kept rather than a stored average so each completion is
-- O(1) and the mean is exact. Minutes because they are integers: accumulating hours as a
-- float would drift over hundreds of completions. The whole-hour figure is rounded once,
-- at the end.
CREATE TABLE "task_standard" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "titleKey"       TEXT NOT NULL,
    "role"           TEXT NOT NULL DEFAULT 'ANALYST',
    "displayTitle"   TEXT NOT NULL,
    "totalMinutes"   INTEGER NOT NULL DEFAULT 0,
    "completions"    INTEGER NOT NULL DEFAULT 0,
    "expectedHours"  INTEGER,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_standard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_standard_organizationId_titleKey_role_key"
    ON "task_standard"("organizationId", "titleKey", "role");
