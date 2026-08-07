-- Completing a project IS the end of it.
--
-- There used to be two steps — mark complete, then close — which said the same thing twice and
-- left two states meaning "finished" in every module (projects, PID ledger, reports, digest,
-- capacity). The Close step is gone; CLOSED rows fold into COMPLETED.
--
-- closedAt is preserved as completedAt where completedAt was never stamped, so nothing loses the
-- date it actually finished on.
UPDATE "project"
   SET "completedAt" = COALESCE("completedAt", "closedAt"),
       "projectPhase" = 'COMPLETED'
 WHERE "projectPhase" = 'CLOSED';

-- A PID whose only project was closed had its reservation discontinued by that step. Those
-- projects now read as completed, and a completed project keeps its number attached — so bring
-- the reservation back in line.
UPDATE "pid_reservation" r
   SET "status" = 'ATTACHED'
 WHERE r."status" = 'DISCONTINUED'
   AND EXISTS (
     SELECT 1 FROM "project" p
      WHERE p."code" = r."pid"
        AND p."deletedAt" IS NULL
        AND p."projectPhase" NOT IN ('ARCHIVED', 'CANCELLED')
   );
