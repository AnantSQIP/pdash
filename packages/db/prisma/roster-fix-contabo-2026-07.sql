-- Contabo one-off (2026-07): add the "Senior Research Associate" role, align five
-- members' role assignments to their designations, and clear seed-generated activity
-- history for nine members (keeping accounts + project memberships).
-- Needs NO code deploy / image rebuild. Idempotent — safe to re-run.
--   docker compose exec -T postgres psql -U <db_user> -d <db_name> < roster-fix-contabo.sql
BEGIN;

-- The nine members whose seed activity is cleared.
CREATE TEMP TABLE _clear_users ON COMMIT DROP AS
SELECT id FROM "user" WHERE email IN (
  'meetu.singh@squarkip.com','anant.gupta@squarkip.com','rajesh.joshi@squarkip.com',
  'arjun.ghosh@squarkip.com','ketan.dagar@squarkip.com','sugandh.raghav@squarkip.com',
  'basant.goyal@squarkip.com','ajay.sharma@squarkip.com','aman.sharma@squarkip.com');

-- 1) Create the role if it doesn't exist yet.
INSERT INTO role (id, "organizationId", name, description)
SELECT md5(random()::text||clock_timestamp()::text),
       (SELECT id FROM organization ORDER BY "createdAt" LIMIT 1),
       'Senior Research Associate',
       'Senior individual contributor (research track) - delegate sub-tasks, triage issues, export reports'
WHERE NOT EXISTS (SELECT 1 FROM role WHERE name='Senior Research Associate');

-- 2a) Grant it EVERY permission the Employee role holds (the baseline).
INSERT INTO role_permission (id, "roleId", "permissionId")
SELECT md5(random()::text||clock_timestamp()::text||rp."permissionId"), sra.id, rp."permissionId"
FROM role sra JOIN role emp ON emp.name='Employee' JOIN role_permission rp ON rp."roleId"=emp.id
WHERE sra.name='Senior Research Associate'
  AND NOT EXISTS (SELECT 1 FROM role_permission x WHERE x."roleId"=sra.id AND x."permissionId"=rp."permissionId");

-- 2b) Plus the three senior-IC additions.
INSERT INTO role_permission (id, "roleId", "permissionId")
SELECT md5(random()::text||clock_timestamp()::text||p.id), sra.id, p.id
FROM role sra JOIN permission p ON p.code IN ('task.assign','issue.update','report.export')
WHERE sra.name='Senior Research Associate'
  AND NOT EXISTS (SELECT 1 FROM role_permission x WHERE x."roleId"=sra.id AND x."permissionId"=p.id);

-- 3) Reassign the five members to the role matching their designation
--    (SRAs -> Senior Research Associate; the Product-Dev intern -> Employee).
--    Two statements: clear their existing role rows first (user_role has a UNIQUE
--    (userId, roleId), and a data-modifying CTE's DELETE is not visible to an INSERT in
--    the same statement), then assign exactly one role each.
DELETE FROM user_role WHERE "userId" IN (
  SELECT id FROM "user" WHERE email IN (
    'basant.goyal@squarkip.com','ketan.dagar@squarkip.com','khushi.gupta@squarkip.com',
    'amritpal.kaur@squarkip.com','anant.gupta@squarkip.com'));

INSERT INTO user_role (id, "userId", "roleId")
SELECT md5(random()::text||clock_timestamp()::text||u.id), u.id, r.id
FROM (VALUES
    ('basant.goyal@squarkip.com','Senior Research Associate'),
    ('ketan.dagar@squarkip.com','Senior Research Associate'),
    ('khushi.gupta@squarkip.com','Senior Research Associate'),
    ('amritpal.kaur@squarkip.com','Senior Research Associate'),
    ('anant.gupta@squarkip.com','Employee')
  ) AS mapping(email, role_name)
JOIN "user" u ON u.email=mapping.email
JOIN role r ON r.name=mapping.role_name;

-- 4) Capture the tasks whose actualHours must be recomputed, then clear seed history.
CREATE TEMP TABLE _affected_tasks ON COMMIT DROP AS
SELECT DISTINCT "taskId" AS id FROM timesheet
WHERE "userId" IN (SELECT id FROM _clear_users) AND "taskId" IS NOT NULL;

DELETE FROM timesheet              WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM task_assignee          WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM attendance             WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM leave_request          WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM comp_off_request       WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM wfh_request            WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM regularization_request WHERE "userId" IN (SELECT id FROM _clear_users);

-- 5) Recompute Task.actualHours = sum of the task's remaining (non-deleted) timesheets.
UPDATE task SET "actualHours" = COALESCE(
    (SELECT SUM("hoursLogged") FROM timesheet ts WHERE ts."taskId"=task.id AND ts."deletedAt" IS NULL), 0)
WHERE id IN (SELECT id FROM _affected_tasks);

-- 6) Clear each member's PERSONAL seed activity/content so they start clean for real-data
--    testing: performance feed + daily metrics, notifications, discuss messages, comments,
--    calendar events (incl. stale LEAVE/WFH events), raised issues, presence, votes,
--    recognitions. SHARED entities (projects/tasks/channels others also use) are left
--    intact; account, login, profile, role and project memberships are kept.
CREATE TEMP TABLE _msgs ON COMMIT DROP AS SELECT id FROM message WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM message_reaction   WHERE "messageId" IN (SELECT id FROM _msgs) OR "userId" IN (SELECT id FROM _clear_users);
DELETE FROM message_mention    WHERE "messageId" IN (SELECT id FROM _msgs) OR "userId" IN (SELECT id FROM _clear_users);
DELETE FROM saved_message      WHERE "messageId" IN (SELECT id FROM _msgs) OR "userId" IN (SELECT id FROM _clear_users);
DELETE FROM message_attachment WHERE "messageId" IN (SELECT id FROM _msgs);
DELETE FROM message            WHERE id IN (SELECT id FROM _msgs);

CREATE TEMP TABLE _events ON COMMIT DROP AS SELECT id FROM calendar_event WHERE "createdBy" IN (SELECT id FROM _clear_users);
DELETE FROM calendar_event_attendee WHERE "eventId" IN (SELECT id FROM _events) OR "userId" IN (SELECT id FROM _clear_users);
DELETE FROM calendar_event           WHERE id IN (SELECT id FROM _events);

CREATE TEMP TABLE _cmts ON COMMIT DROP AS SELECT id FROM comment WHERE "userId" IN (SELECT id FROM _clear_users);
DELETE FROM comment_attachment WHERE "commentId" IN (SELECT id FROM _cmts);
DELETE FROM comment            WHERE id IN (SELECT id FROM _cmts);

CREATE TEMP TABLE _issues ON COMMIT DROP AS SELECT id FROM issue WHERE "reportedBy" IN (SELECT id FROM _clear_users);
DELETE FROM comment WHERE "entityType"='ISSUE' AND "entityId" IN (SELECT id FROM _issues);
DELETE FROM issue   WHERE id IN (SELECT id FROM _issues);
UPDATE issue SET "assigneeId"=NULL WHERE "assigneeId" IN (SELECT id FROM _clear_users);

DELETE FROM analytics_event   WHERE "userId"  IN (SELECT id FROM _clear_users);
DELETE FROM user_metric_daily WHERE "userId"  IN (SELECT id FROM _clear_users);
DELETE FROM activity          WHERE "actorId" IN (SELECT id FROM _clear_users);
DELETE FROM notification      WHERE "userId"  IN (SELECT id FROM _clear_users);
DELETE FROM presence          WHERE "userId"  IN (SELECT id FROM _clear_users);
DELETE FROM poll_vote         WHERE "userId"  IN (SELECT id FROM _clear_users);
DELETE FROM reward            WHERE "recipientId" IN (SELECT id FROM _clear_users) OR "givenById" IN (SELECT id FROM _clear_users);

COMMIT;
