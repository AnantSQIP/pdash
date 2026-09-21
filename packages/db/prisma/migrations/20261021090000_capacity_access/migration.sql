-- Team Capacity belongs to Senior Consultant and above (owner, Sep 2026).
--
-- "This CRUD power in Team Capacity is given to people whose role is above or equal to Senior
-- Consultant, and the Team Capacity module is only visible to these." The ladder is the delivery
-- one: Super Admin, Admin, Manager, Senior Consultant. HR is people-ops, not delivery, and is NOT
-- on it (it held capacity.view until now and loses it here).
--
-- Data only — no schema change — and written so a deployed database gets the change WITHOUT
-- regrant-roles.ts, which rewrites every role to its preset and would wipe the edits made on
-- /admin/access. Everything below touches only the two capacity codes; every other grant stays
-- exactly as it is. Re-runnable: every statement is an upsert or a delete of a condition that the
-- first run already made false.
--
--  1. The new code, capacity.manage, exists (the seed writes the same row on a fresh database).
--  2. Every role NAMED Super Admin, Admin, Manager or Senior Consultant, in every organisation,
--     holds capacity.view and capacity.manage. (A Super Admin passes every check implicitly; its
--     rows are written anyway so the stored grants match the seed's expansion of '*'.)
--  3. Nobody else keeps capacity.view: it is removed from every other role, from every permission
--     group, and from the direct grants and ALLOW overrides of anyone who holds none of the ladder
--     roles. A ladder member keeps their grants (redundant, harmless). DENY overrides are left
--     alone — a DENY on somebody is a decision somebody made about them.

-- 1 ─────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO "permission" ("id", "code", "name", "description")
VALUES ('perm_capacity_manage', 'capacity.manage', 'Team Capacity — Manage',
        'Create, edit, assign and delete tasks from Team Capacity')
ON CONFLICT ("code") DO NOTHING;

-- 2 ─────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO "role_permission" ("id", "roleId", "permissionId")
SELECT 'cap' || md5(r."id" || ':' || p."code"), r."id", p."id"
FROM "role" r
CROSS JOIN "permission" p
WHERE r."name" IN ('Super Admin', 'Admin', 'Manager', 'Senior Consultant')
  AND p."code" IN ('capacity.view', 'capacity.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 3 ─────────────────────────────────────────────────────────────────────────────────────────────
-- Other roles.
DELETE FROM "role_permission" rp
USING "role" r, "permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND p."code" = 'capacity.view'
  AND r."name" NOT IN ('Super Admin', 'Admin', 'Manager', 'Senior Consultant');

-- Permission groups. A group grant reaches every member, and a ladder member already holds the
-- code through their role, so no group needs it.
DELETE FROM "permission_group_permission" gp
USING "permission" p
WHERE gp."permissionId" = p."id"
  AND p."code" = 'capacity.view';

-- Direct grants to anyone below the ladder.
DELETE FROM "user_permission" up
USING "permission" p
WHERE up."permissionId" = p."id"
  AND p."code" = 'capacity.view'
  AND NOT EXISTS (
    SELECT 1 FROM "user_role" ur JOIN "role" r ON r."id" = ur."roleId"
    WHERE ur."userId" = up."userId"
      AND r."name" IN ('Super Admin', 'Admin', 'Manager', 'Senior Consultant')
  );

-- ALLOW overrides for anyone below the ladder (DENY overrides are kept).
DELETE FROM "permission_override" po
USING "permission" p
WHERE po."permissionId" = p."id"
  AND p."code" = 'capacity.view'
  AND po."effect" = 'ALLOW'
  AND NOT EXISTS (
    SELECT 1 FROM "user_role" ur JOIN "role" r ON r."id" = ur."roleId"
    WHERE ur."userId" = po."userId"
      AND r."name" IN ('Super Admin', 'Admin', 'Manager', 'Senior Consultant')
  );
