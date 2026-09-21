-- CLIENTS-FLOW, phase 7: the date promised to the client, on a task group.
--
-- (This migration also reshaped pid_request for a PID request pool while the clients flow lived in
-- its own branch. That pool never reached production and the CLIENTS flow no longer uses requests,
-- so the table is left exactly as the PROJECTS flow uses it — see docs/WORKSPACE_FLOWS.md.)
--
-- Additive: a nullable column and a CHECK that only binds when both dates are set.

ALTER TABLE "task_list" ADD COLUMN "clientDueDate" TIMESTAMP(3);
ALTER TABLE "task_list" ADD CONSTRAINT "task_list_internal_before_client"
    CHECK ("dueDate" IS NULL OR "clientDueDate" IS NULL OR "dueDate" <= "clientDueDate");
