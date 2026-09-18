-- CLIENTS-FLOW (PID rework): "every client without a PID waits in the PID queue" has to hold for
-- clients made BEFORE the rule too, or the ones most likely to have been forgotten stay invisible.
-- Data only; no schema change.
--
--  · Only live, unfinished clients. A completed, closed, archived or cancelled engagement from
--    before PIDs existed has nothing left to file, and queueing it would bury the real requests.
--  · A project row has no organisation column; it belongs to the organisation of the person who
--    made it, or — for a seeded row made by "system" — of its earliest active member, which is how
--    the API resolves it too. A client whose organisation cannot be told is left alone.
--  · Dated now, not when the client was made — so the first reminder comes a day after deploy,
--    rather than every old client reminding every authority the moment the API starts.
--  · Never a second open request: the partial unique index allows one, and NOT EXISTS keeps this
--    re-runnable.
INSERT INTO "pid_request" ("id", "organizationId", "projectId", "requestedById", "kind", "status", "createdAt")
SELECT 'bf' || md5(x."id"), x."organizationId", x."id", x."createdBy", 'NEW', 'PENDING', CURRENT_TIMESTAMP
FROM (
  SELECT p."id", p."createdBy",
         COALESCE(
           (SELECT u."organizationId" FROM "user" u WHERE u."id" = p."createdBy"),
           (SELECT u."organizationId" FROM "project_member" pm JOIN "user" u ON u."id" = pm."userId"
             WHERE pm."projectId" = p."id" AND pm."isActive" ORDER BY pm."joinedAt" LIMIT 1)
         ) AS "organizationId"
  FROM "project" p
  WHERE p."deletedAt" IS NULL
    AND p."code" IS NULL
    AND p."projectPhase" NOT IN ('COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED')
    AND p."closedAt" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "pid_request" r WHERE r."projectId" = p."id" AND r."status" = 'PENDING'
    )
) x
WHERE x."organizationId" IS NOT NULL;
