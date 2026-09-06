-- Task timing, and expected hours learned from what tasks actually take.
--
-- Additive only: nothing is dropped and nothing existing changes meaning. Tasks already
-- closed have no sessions and contribute nothing to the averages, which is correct — the
-- system knows how long a task takes only once it has been timed.

ALTER TABLE "task" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "task" ADD COLUMN "reopenedCount" INTEGER NOT NULL DEFAULT 0;
-- What this task has already contributed to its standard, so a re-completion after a
-- reopen posts only the difference and one task counts once, at its final total.
ALTER TABLE "task" ADD COLUMN "standardMinutes" INTEGER;
-- Which standard it contributed to. A task can be renamed after completion; without this
-- the contribution is stranded under the old title.
ALTER TABLE "task" ADD COLUMN "standardKey" TEXT;

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

-- What a standard task actually takes, accumulated across every completion of it anywhere.
--
-- totalMinutes and completions are kept rather than a stored average so each completion is
-- O(1) and the mean is exact. Minutes because they are integers: accumulating hours as a
-- float would drift over hundreds of completions. The whole-hour figure is rounded once,
-- at the end.
CREATE TABLE "task_standard" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "titleKey"       TEXT NOT NULL,
    "displayTitle"   TEXT NOT NULL,
    "totalMinutes"   INTEGER NOT NULL DEFAULT 0,
    "completions"    INTEGER NOT NULL DEFAULT 0,
    "expectedHours"  INTEGER,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "task_standard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_standard_organizationId_titleKey_key"
    ON "task_standard"("organizationId", "titleKey");
