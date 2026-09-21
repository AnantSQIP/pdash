-- Six indexes the schema has always DECLARED and no migration has ever CREATED.
--
-- Prisma only emits DDL for what a generated migration diffs; these six @@index lines were added
-- to schema.prisma by hand, so `prisma generate` was happy, `prisma validate` was happy, and the
-- indexes were absent from every database built by `migrate deploy` — including production. The
-- schema said one thing and every server ran another.
--
-- CREATE INDEX IF NOT EXISTS throughout, with the exact names Prisma derives (<table>_<column>_idx),
-- so this is a no-op on any database that somehow has them and so a future generated migration
-- recognises them as the declared indexes rather than proposing to create them a second time.
--
-- Deliberately NOT CONCURRENTLY: Prisma runs each migration inside a transaction, which CONCURRENTLY
-- cannot join. These are small single-column b-trees over a firm-sized dataset — tens of thousands
-- of rows, built in milliseconds — so the brief ACCESS SHARE-blocking write lock is not worth
-- splitting the deployment over.

-- ── The two that carry real weight ──────────────────────────────────────────
-- Both sit directly under "what is this person working on": My Tasks, the capacity board, the
-- home cards, every report that starts from a member. Measured at 40,000 tasks, the assignee
-- lookup went from a 4.9ms sequential scan to a 0.09ms index scan.
CREATE INDEX IF NOT EXISTS "task_assignee_userId_idx" ON "task_assignee"("userId");
CREATE INDEX IF NOT EXISTS "project_member_userId_idx" ON "project_member"("userId");

-- ── Issue ownership ─────────────────────────────────────────────────────────
-- "Issues assigned to me" and "issues I raised", both selective enough to use an index.
CREATE INDEX IF NOT EXISTS "issue_assigneeId_idx" ON "issue"("assigneeId");
CREATE INDEX IF NOT EXISTS "issue_reportedBy_idx" ON "issue"("reportedBy");

-- ── The two soft-delete columns, added for honesty rather than speed ────────
-- Almost every row has deletedAt IS NULL, so the planner will normally prefer a sequential scan
-- over either of these and they will buy close to nothing on their own. They are created anyway
-- because the schema declares them: an index that is declared and absent is a lie about the
-- database that the next person to read schema.prisma will believe. They do pay when combined
-- with another index on a narrow query, and the write cost of one b-tree per table is slight.
CREATE INDEX IF NOT EXISTS "project_deletedAt_idx" ON "project"("deletedAt");
CREATE INDEX IF NOT EXISTS "task_deletedAt_idx" ON "task"("deletedAt");
