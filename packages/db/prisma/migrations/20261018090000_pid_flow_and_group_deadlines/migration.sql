-- CLIENTS-FLOW, phases 6 and 7. Nothing is dropped except a UNIQUE index that is replaced by a
-- narrower one; every column added is nullable or defaulted, so code built before this runs
-- unchanged against it (it only ever creates one request per client, which stays legal).

-- ── PID requests: a pool, with history ───────────────────────────────────────────────────────
-- A client may now have several requests over its life (a NEW one, later a CHANGE), but never
-- two OPEN at once. The old one-row-per-client rule is replaced by exactly that.
DROP INDEX IF EXISTS "pid_request_projectId_key";
CREATE INDEX "pid_request_projectId_idx" ON "pid_request"("projectId");
CREATE UNIQUE INDEX "pid_request_one_open_per_client" ON "pid_request"("projectId") WHERE "status" = 'PENDING';

-- "Who to ask first" is optional now: every authority sees every open request.
ALTER TABLE "pid_request" ALTER COLUMN "assigneeId" DROP NOT NULL;

ALTER TABLE "pid_request"
    ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'NEW',
    ADD COLUMN "reason" TEXT,
    ADD COLUMN "suggestedPid" TEXT,
    ADD COLUMN "remindedAt" TIMESTAMP(3),
    ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "resolvedById" TEXT,
    ADD COLUMN "resolutionNote" TEXT;

ALTER TABLE "pid_request" ADD CONSTRAINT "pid_request_kind_check" CHECK ("kind" IN ('NEW', 'CHANGE'));
ALTER TABLE "pid_request" ADD CONSTRAINT "pid_request_status_check"
    CHECK ("status" IN ('PENDING', 'FULFILLED', 'CANCELLED', 'DECLINED'));

-- ── Task groups: the date promised to the client ─────────────────────────────────────────────
ALTER TABLE "task_list" ADD COLUMN "clientDueDate" TIMESTAMP(3);
-- The team's deadline is the buffered one; it can never be later than the promise.
ALTER TABLE "task_list" ADD CONSTRAINT "task_list_internal_before_client"
    CHECK ("dueDate" IS NULL OR "clientDueDate" IS NULL OR "dueDate" <= "clientDueDate");
