-- Remove the pointless empty "General" group.
--
-- A project created WITH a type used to get two task groups: an empty "General" (the default)
-- plus the type's own group holding the actual template tasks. Every board therefore opened with
-- an empty group above the real work, and it was not obvious what it was for.
--
-- New projects no longer create it (the type's group IS the default). This clears the ones already
-- out there: an EMPTY default group named "General" is deleted, and the project's remaining group
-- is promoted to default so new tasks still have somewhere to land.
--
-- Deliberately conservative: only groups that are named "General", are the default, hold NO tasks,
-- and are not the project's only group. Anything renamed, used, or alone is left untouched.

-- 1. Promote a surviving group to default, for the projects about to lose their "General".
UPDATE "task_list" tl
   SET "isDefault" = true
 WHERE tl."id" IN (
   SELECT DISTINCT ON (keep."projectId") keep."id"
     FROM "task_list" keep
     JOIN "task_list" empty
       ON empty."projectId" = keep."projectId"
      AND empty."isDefault" = true
      AND empty."name" = 'General'
      AND empty."deletedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "project_task" pt WHERE pt."taskListId" = empty."id")
    WHERE keep."id" <> empty."id"
      AND keep."deletedAt" IS NULL
    ORDER BY keep."projectId", keep."sequence" ASC, keep."createdAt" ASC
 );

-- 2. Delete the now-redundant empty "General" groups.
DELETE FROM "task_list" tl
 WHERE tl."isDefault" = true
   AND tl."name" = 'General'
   AND tl."deletedAt" IS NULL
   AND NOT EXISTS (SELECT 1 FROM "project_task" pt WHERE pt."taskListId" = tl."id")
   AND EXISTS (
     SELECT 1 FROM "task_list" other
      WHERE other."projectId" = tl."projectId"
        AND other."id" <> tl."id"
        AND other."deletedAt" IS NULL
   );
