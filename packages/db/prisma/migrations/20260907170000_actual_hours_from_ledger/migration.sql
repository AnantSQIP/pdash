-- Task.actualHours has exactly one writer from here on: the sum of the task's non-deleted
-- timesheet hours. Tasks closed under the earlier close path carried a different figure (the sum
-- of confirmed hours) that the next timesheet would silently have overwritten. Bring every task
-- in line once, touching only rows whose value actually differs.
UPDATE "task" t
SET "actualHours" = ledger.total
FROM (
  SELECT t2.id,
         COALESCE((SELECT SUM(ts."hoursLogged") FROM "timesheet" ts WHERE ts."taskId" = t2.id AND ts."deletedAt" IS NULL), 0) AS total
  FROM "task" t2
) ledger
WHERE ledger.id = t.id
  AND t."actualHours" IS DISTINCT FROM ledger.total;
