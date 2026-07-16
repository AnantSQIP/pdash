-- Tasks no longer have a client-facing deadline — it lives only on the Project.
-- Drop the now-unused column (task keeps its single dueDate).

ALTER TABLE "task" DROP COLUMN IF EXISTS "clientDueDate";
