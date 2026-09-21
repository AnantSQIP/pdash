-- CLIENTS-FLOW (deadlines): a task group's deadline is the client-facing commitment now, so its
-- moves are recorded in the deadline ledger too. The ledger's own CHECK only allowed PROJECT and
-- TASK; widen it. Widening a CHECK cannot invalidate an existing row.
ALTER TABLE "deadline_change" DROP CONSTRAINT IF EXISTS "deadline_change_entity_type_check";
ALTER TABLE "deadline_change" ADD CONSTRAINT "deadline_change_entity_type_check"
    CHECK ("entityType" IN ('PROJECT', 'TASK', 'TASK_GROUP'));
