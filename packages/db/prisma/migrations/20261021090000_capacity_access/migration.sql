-- Team Capacity management — the permission code only (docs/WORKSPACE_FLOWS.md).
--
-- The CLIENTS flow gives Team Capacity to Senior Consultant and above, who may also create, edit,
-- assign and delete tasks from it (capacity.manage). WHO holds which capacity code depends on the
-- organisation's flow, so the grants are made by the workspace-flow conversion, not here: a
-- PROJECTS organisation keeps Team Capacity for everybody, exactly as before.
--
-- This only makes the code exist (the seed writes the same row on a fresh database). Re-runnable.

INSERT INTO "permission" ("id", "code", "name", "description")
VALUES ('perm_capacity_manage', 'capacity.manage', 'Team Capacity — Manage',
        'Create, edit, assign and delete tasks from Team Capacity')
ON CONFLICT ("code") DO NOTHING;
