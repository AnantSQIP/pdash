/**
 * CHANGING AN ORGANISATION'S WORKSPACE FLOW — PROJECTS ⇄ CLIENTS (docs/WORKSPACE_FLOWS.md).
 *
 * SWITCHING HIDES A FLOW'S WORK; IT DOES NOT CONVERT IT.
 *
 * Every project/client row carries the flow it was made in (`project.workspaceFlow`), and the two
 * flows' reads are filtered on it, so a firm's client work and its project work sit side by side
 * in one database and never meet. That makes a change of flow a change to the ORGANISATION'S
 * SETTINGS and nothing else:
 *
 *   · the flow itself;
 *   · who holds Team Capacity (CLIENTS: the delivery ladder manages it and HR reads it; PROJECTS:
 *     the presets production has always had — everybody sees the board, only a Super Admin
 *     manages it);
 *   · the time mode — PROJECTS may use the timer, CLIENTS is MANUAL only, so entering CLIENTS
 *     closes the clocks that are running and records the switch in the time-mode history.
 *
 * And what it deliberately NO LONGER does — this is the point, so it is written down: it does not
 * give anything a number, does not retire or re-read the number registry, does not write the CID
 * ledger, does not cancel PID requests, does not touch a project, task, timesheet or staffing row
 * of either flow. The work of the flow being left stays exactly as it is, out of sight, and is
 * there again, unchanged, if the firm switches back. The conversion PROVES that: it counts every
 * flow's work before it starts and again before it commits, and rolls back if a single count moved.
 *
 * WHAT A CONVERSION IS
 *
 *   one transaction, all or nothing:
 *     1. an org-scoped advisory lock (two conversions of one organisation can never interleave;
 *        the second is refused, not queued) and the organisation row FOR UPDATE, re-read;
 *     2. the work tables are locked against writers (SHARE ROW EXCLUSIVE — reads carry on), so
 *        that "nothing was touched" is a fact rather than a hope, and no clock can be started or
 *        grant slipped in between the steps and the verification;
 *     3. a survey of what is there, including a count of each flow's work (stored as the
 *        conversion's "preflight");
 *     4. the steps (above), each reporting what it changed;
 *     5. the new flow's invariants, checked INSIDE the transaction — including that every count
 *        from step 3 is unchanged. One failing rolls the whole conversion back and the report says
 *        which, with examples;
 *     6. the workspace_flow_change row (survey, steps, verification) and, from the caller, the
 *        audit event — in the same transaction, so the record exists exactly when the change does.
 *
 *   The preflight is the same code run as a DRY RUN: the transaction is always rolled back, so
 *   "what will change" is not an estimate — it is what the conversion does, counted, and whether
 *   its verification would pass. Nothing is written.
 *
 * TENANCY. `project` has no organisation column. A project belongs to its creator's
 * organisation, else to that of its earliest member, else to the first organisation — the rule
 * CidService.orgForProject and the flow migration use. Every statement here is scoped to ONE
 * organisation through that rule or through user.organizationId; nothing touches another tenant.
 *
 * This file is plain TypeScript over Prisma (no Nest), exported from @pdash/db.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type WorkspaceFlowName = 'PROJECTS' | 'CLIENTS';
export const WORKSPACE_FLOW_NAMES: readonly WorkspaceFlowName[] = ['PROJECTS', 'CLIENTS'];

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

// ── Pure pieces (pinned against the API's own copies by tools/workspace-flow-conversion.spec.ts) ─

/** A clock nobody stopped stops counting after this — SESSION_CAP_MINUTES in common/work-time.ts. */
export const CONVERSION_SESSION_CAP_MINUTES = 12 * 60;

export const CAPACITY_VIEW = 'capacity.view';
export const CAPACITY_MANAGE = 'capacity.manage';
export const CAPACITY_CODES = [CAPACITY_VIEW, CAPACITY_MANAGE] as const;

/** The delivery ladder: who EDITS Team Capacity in the CLIENTS flow (CLIENTS presets). */
export const DELIVERY_LADDER_ROLES = ['Super Admin', 'Admin', 'Manager', 'Senior Consultant'] as const;
/**
 * Who may only READ the board in the CLIENTS flow. HR, since the owner's call of 19 Sep 2026: who
 * is loaded and who is free is a people question too, but the board stays the ladder's to change.
 */
export const CAPACITY_VIEWER_ROLES = ['HR'] as const;
/** Every role that holds any capacity code in a flow — who a stray grant is redundant for. */
export function capacityRolesFor(flow: WorkspaceFlowName): readonly string[] {
  return flow === 'CLIENTS' ? [...DELIVERY_LADDER_ROLES, ...CAPACITY_VIEWER_ROLES] : [];
}
/** Roles whose preset is '*' (every code) in both flows. */
export const ALL_CODES_ROLES = ['Super Admin'] as const;

/**
 * The capacity codes a role holds in a flow — rolePresetsFor(flow) restricted to the two capacity
 * codes, and the rule for a role no preset names (a custom role): none in CLIENTS (the board is
 * the ladder's, plus HR reading it), capacity.view in PROJECTS (everyone sees the board). Pinned
 * against the catalog by tools/workspace-flow-conversion.spec.ts, so the two cannot drift.
 */
export function capacityCodesFor(flow: WorkspaceFlowName, roleName: string): string[] {
  if (flow === 'CLIENTS') {
    if ((DELIVERY_LADDER_ROLES as readonly string[]).includes(roleName)) return [CAPACITY_VIEW, CAPACITY_MANAGE];
    return (CAPACITY_VIEWER_ROLES as readonly string[]).includes(roleName) ? [CAPACITY_VIEW] : [];
  }
  return (ALL_CODES_ROLES as readonly string[]).includes(roleName) ? [CAPACITY_VIEW, CAPACITY_MANAGE] : [CAPACITY_VIEW];
}

/**
 * The registry states each flow knows. The database CHECK holds their union, and the registry
 * itself is SHARED — a PROJECTS PID and a CLIENTS CID are rows in the same table — so a row is
 * judged by the flow of the work it is attached to, not by the flow the organisation is running.
 * A row attached to nothing (a hold nobody took, a number long retired) belongs to no flow.
 */
export const REGISTRY_STATUSES_BY_FLOW: Record<WorkspaceFlowName, readonly string[]> = {
  PROJECTS: ['RESERVED', 'ATTACHED', 'RELEASED', 'EXPIRED', 'DISCONTINUED'],
  CLIENTS: ['ATTACHED', 'DELETED', 'PURGED', 'MERGED', 'DISCONTINUED'],
};

/** The advisory-lock key a conversion (or its dry run) holds for its organisation. */
export const conversionLockKey = (organizationId: string) => `workspace-flow:${organizationId}`;

/**
 * Every step a conversion into each flow takes, in order. A conversion is a SETTINGS change, so
 * this list is short on purpose and the run asserts that what it did matches it — a step added
 * without a thought about this file fails immediately rather than on somebody's live database.
 */
export const CONVERSION_STEPS: Record<WorkspaceFlowName, readonly string[]> = {
  CLIENTS: ['clocks', 'time_mode', 'capacity', 'work_kept', 'flow'],
  PROJECTS: ['capacity', 'time_mode', 'work_kept', 'flow'],
};

/**
 * Steps a conversion USED to take, before each row carried the flow it belongs to. Every one of
 * them rewrote work: numbers issued and retired, the registry re-read, the CID ledger written, PID
 * requests cancelled. They are named here so that the test can say they are gone, rather than
 * nobody noticing if one came back.
 */
export const RETIRED_CONVERSION_STEPS: readonly string[] = [
  'pid_requests', 'registry_register', 'registry_retire', 'registry_rederive',
  'ledger_import', 'cid_backfill', 'registry_map', 'kept',
];

// ── Report shapes (stored as JSON in workspace_flow_change and returned to the caller) ──────────

export type ConversionBlocker = { code: string; message: string; examples?: string[] };

export type ConversionStep = {
  key: string;
  /** What the step does, in words a Super Admin reads. */
  label: string;
  /** Rows it changed (0 = nothing to do). */
  changed: number;
  details?: Record<string, unknown>;
};

export type ConversionInvariant = { key: string; label: string; ok: boolean; found: number; examples?: string[] };

export type ConversionVerification = {
  flow: WorkspaceFlowName;
  ok: boolean;
  invariants: ConversionInvariant[];
};

/** A count of one thing on each side of the line. */
export type WorkByFlow = { PROJECTS: number; CLIENTS: number };

/**
 * Every flow's work, counted. Taken before the conversion's steps and again before it commits: a
 * conversion changes settings, so every one of these numbers must come out the same twice.
 */
export type WorkSnapshot = {
  projects: WorkByFlow;
  liveProjects: WorkByFlow;
  tasks: WorkByFlow;
  timesheets: WorkByFlow;
  staffing: WorkByFlow;
  /** Attached to no project at all — a team space's tasks and the time logged against them. Shared. */
  shared: { tasks: number; timesheets: number };
  /** Live rows of each flow with no number yet (a PROJECTS project waiting for its PID). */
  withoutNumber: WorkByFlow;
  registryByStatus: Record<string, number>;
  pidRequestsByStatus: Record<string, number>;
  cidEvents: number;
};

export type ConversionSurvey = {
  organization: {
    id: string; name: string; code: string;
    workspaceFlow: WorkspaceFlowName; workspaceFlowChangedAt: string | null; timeTrackingMode: string;
  };
  inUse: { projects: number; liveProjects: number; tasks: number; timesheets: number; any: boolean };
  /** What each flow holds. The conversion leaves all of it exactly as it finds it. */
  work: WorkSnapshot;
  runningClocks: number;
  capacity: {
    roles: { name: string; users: number; codes: string[] }[];
    groups: { name: string; codes: string[] }[];
    directGrants: number;
    allowOverrides: number;
    denyOverrides: number;
  };
};

export type ConversionReport = {
  dryRun: boolean;
  organizationId: string;
  organizationName: string;
  from: WorkspaceFlowName;
  to: WorkspaceFlowName;
  /** Is the organisation using its current flow at all? False → nothing is waiting to be hidden. */
  inUse: boolean;
  survey: ConversionSurvey;
  steps: ConversionStep[];
  verification: ConversionVerification;
  /** Refusals found before or by the dry run. A real conversion never returns with any. */
  blockers: ConversionBlocker[];
  changeId: string | null;
  changedAt: string | null;
};

export type ConversionErrorCode =
  | 'NOT_FOUND' | 'SAME_FLOW' | 'CONVERSION_RUNNING' | 'BLOCKED' | 'VERIFICATION_FAILED' | 'BUSY_DATABASE';

export class WorkspaceFlowConversionError extends Error {
  constructor(
    readonly code: ConversionErrorCode,
    message: string,
    readonly report?: ConversionReport,
    readonly blockers?: ConversionBlocker[],
  ) {
    super(message);
    this.name = 'WorkspaceFlowConversionError';
  }
}

export type ConversionInput = {
  organizationId: string;
  to: WorkspaceFlowName;
  /** Who is converting: a user id (API, or the CLI's --as). Stored as changedBy. */
  actorId: string;
  note?: string | null;
  /**
   * The caller skipped the backup and typed-name confirmations because the organisation had
   * nothing in the flow it is leaving. Checked again inside the transaction: if it is in use by
   * then, refused.
   */
  notInUseShortcut?: boolean;
  /** Written inside the transaction after verification passes — the audit event. */
  auditInTx?: (tx: Tx, report: ConversionReport) => Promise<void>;
};

const NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;
const TX_OPTIONS = { timeout: 120_000, maxWait: 15_000 } as const;

class DryRunRollback extends Error {
  constructor(readonly report: ConversionReport) { super('dry run'); }
}

// ── Public API ──────────────────────────────────────────────────────────────────────────────────

/**
 * What converting `organizationId` to `to` will do — the conversion itself, run and rolled back.
 * Never throws for a refusal: refusals are returned as blockers, so a screen can show them.
 */
export async function preflightWorkspaceFlow(
  prisma: PrismaClient, input: Omit<ConversionInput, 'note' | 'auditInTx'>,
): Promise<ConversionReport> {
  try {
    await run(prisma, input, true);
    throw new Error('unreachable: a dry run always rolls back');
  } catch (e) {
    if (e instanceof DryRunRollback) return e.report;
    if (e instanceof WorkspaceFlowConversionError && e.code !== 'NOT_FOUND') {
      if (e.report) return { ...e.report, blockers: e.blockers ?? e.report.blockers };
      // Refused before anything was surveyed (another conversion running, same flow, locks).
      const survey = await surveyOrg(prisma, input.organizationId);
      return {
        dryRun: true,
        organizationId: input.organizationId,
        organizationName: survey.organization.name,
        from: survey.organization.workspaceFlow,
        to: input.to,
        inUse: survey.inUse.any,
        survey,
        steps: [],
        verification: { flow: input.to, ok: false, invariants: [] },
        blockers: e.blockers ?? [{ code: e.code, message: e.message }],
        changeId: null,
        changedAt: null,
      };
    }
    throw e;
  }
}

/** Convert for real. Throws WorkspaceFlowConversionError on any refusal; nothing is written then. */
export async function convertWorkspaceFlow(prisma: PrismaClient, input: ConversionInput): Promise<ConversionReport> {
  return run(prisma, input, false);
}

/** Is an organisation using its flow — any project, task or timesheet, deleted ones included? */
export async function workspaceInUse(db: Db, organizationId: string) {
  const [row] = await db.$queryRaw<{ projects: bigint; live: bigint; tasks: bigint; timesheets: bigint }[]>`
    SELECT
      (SELECT count(*) FROM ${orgProjects(organizationId)} p)                                   AS projects,
      (SELECT count(*) FROM ${orgProjects(organizationId)} p WHERE p."deletedAt" IS NULL)       AS live,
      (SELECT count(*) FROM "task" t JOIN "user" u ON u."id" = t."createdBy"
        WHERE u."organizationId" = ${organizationId})                                           AS tasks,
      (SELECT count(*) FROM "timesheet" ts JOIN "user" u ON u."id" = ts."userId"
        WHERE u."organizationId" = ${organizationId})                                           AS timesheets`;
  const projects = Number(row.projects), tasks = Number(row.tasks), timesheets = Number(row.timesheets);
  return { projects, liveProjects: Number(row.live), tasks, timesheets, any: projects + tasks + timesheets > 0 };
}

// ── The run ─────────────────────────────────────────────────────────────────────────────────────

async function run(prisma: PrismaClient, input: ConversionInput, dryRun: boolean): Promise<ConversionReport> {
  const { organizationId, to } = input;
  if (!WORKSPACE_FLOW_NAMES.includes(to)) {
    throw new WorkspaceFlowConversionError('BLOCKED', `Unknown workspace flow "${to}".`);
  }
  try {
    return await prisma.$transaction(async tx => {
      // A lock we cannot get within 15s is a busy database, not a reason to hang the request.
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '15s'`);

      const [lock] = await tx.$queryRaw<{ got: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${conversionLockKey(organizationId)})) AS got`;
      if (!lock?.got) {
        throw new WorkspaceFlowConversionError(
          'CONVERSION_RUNNING',
          'A workspace-flow conversion (or its dry run) is running for this organisation right now. Try again in a moment.',
        );
      }
      const orgs = await tx.$queryRaw<{ id: string; workspaceFlow: string }[]>`
        SELECT "id", "workspaceFlow" FROM "organization" WHERE "id" = ${organizationId} FOR UPDATE`;
      if (!orgs.length) throw new WorkspaceFlowConversionError('NOT_FOUND', 'Organisation not found.');
      const from: WorkspaceFlowName = orgs[0].workspaceFlow === 'CLIENTS' ? 'CLIENTS' : 'PROJECTS';
      if (from === to) {
        throw new WorkspaceFlowConversionError(
          'SAME_FLOW', `This organisation already runs the ${to} flow — there is nothing to convert.`,
          undefined, [{ code: 'SAME_FLOW', message: `Already on the ${to} flow.` }],
        );
      }

      // Writers wait; readers carry on. The grant tables because the conversion rewrites them; the
      // work tables because the conversion promises not to, and a count taken while somebody is
      // logging time would prove nothing either way.
      await tx.$executeRawUnsafe(
        `LOCK TABLE "project", "project_task", "task", "task_assignee", "timesheet",
                    "pid_reservation", "pid_request", "cid_event", "task_work_session",
                    "role_permission", "permission_group_permission", "user_permission", "permission_override"
         IN SHARE ROW EXCLUSIVE MODE`,
      );

      const survey = await surveyOrg(tx, organizationId);
      const base = {
        dryRun,
        organizationId,
        organizationName: survey.organization.name,
        from,
        to,
        inUse: survey.inUse.any,
        survey,
        changeId: null as string | null,
        changedAt: null as string | null,
      };

      if (!dryRun && input.notInUseShortcut && survey.inUse.any) {
        throw new WorkspaceFlowConversionError(
          'BLOCKED',
          'This organisation has started using its flow since the screen was opened. Take a backup and confirm with the organisation’s name.',
          undefined, [{ code: 'IN_USE_NOW', message: 'The organisation is in use now.' }],
        );
      }

      const changeId = dryRun ? 'dry-run' : `wfc_${randomUUID().replace(/-/g, '')}`;
      const ctx: StepContext = { tx, organizationId, actorId: input.actorId, changeId, survey };
      const steps = to === 'CLIENTS' ? await toClients(ctx) : await toProjects(ctx);
      const took = steps.map(s => s.key).join(',');
      if (took !== CONVERSION_STEPS[to].join(',')) {
        // Not a user's mistake — a developer's. Fail loudly inside the transaction, so it rolls back.
        throw new Error(`Conversion to ${to} took the steps [${took}]; CONVERSION_STEPS says [${CONVERSION_STEPS[to].join(',')}].`);
      }
      const verification = await verify(tx, organizationId, to, survey.work);

      const failed = verification.invariants.filter(i => !i.ok);
      const report: ConversionReport = {
        ...base,
        steps,
        verification,
        blockers: failed.map(i => ({
          code: 'VERIFICATION', message: `Would not hold after converting: ${i.label} (${i.found} found).`, examples: i.examples,
        })),
      };
      if (dryRun) throw new DryRunRollback(report);
      if (!verification.ok) {
        throw new WorkspaceFlowConversionError(
          'VERIFICATION_FAILED',
          `The conversion was rolled back: ${failed.map(i => i.label).join('; ')}.`,
          report, report.blockers,
        );
      }

      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT ${NOW} AS at`;
      await tx.workspaceFlowChange.create({
        data: {
          id: changeId,
          organizationId,
          fromFlow: from,
          toFlow: to,
          changedBy: input.actorId,
          changedAt: at,
          note: input.note?.trim() || null,
          preflight: json(survey),
          applied: json({ steps }),
          verification: json(verification),
        },
      });
      const done: ConversionReport = { ...report, changeId, changedAt: at.toISOString() };
      if (input.auditInTx) await input.auditInTx(tx, done);
      return done;
    }, TX_OPTIONS);
  } catch (e) {
    // lock_timeout (55P03) — somebody held a lock on a table the conversion needs for 15s.
    const msg = e instanceof Error ? e.message : String(e);
    if (!(e instanceof WorkspaceFlowConversionError) && !(e instanceof DryRunRollback) && /55P03|lock timeout/i.test(msg)) {
      throw new WorkspaceFlowConversionError(
        'BUSY_DATABASE', 'The database was too busy to lock what the conversion needs. Nothing was changed — try again in a quieter moment.',
      );
    }
    throw e;
  }
}

// ── Survey ──────────────────────────────────────────────────────────────────────────────────────

/** This organisation's projects (live and soft-deleted), by the derived-organisation rule. */
function orgProjects(organizationId: string): Prisma.Sql {
  return Prisma.sql`(
    SELECT p.* FROM "project" p
    WHERE COALESCE(
      (SELECT u."organizationId" FROM "user" u WHERE u."id" = p."createdBy"),
      (SELECT u."organizationId" FROM "project_member" pm JOIN "user" u ON u."id" = pm."userId"
        WHERE pm."projectId" = p."id" ORDER BY pm."isActive" DESC, pm."joinedAt" LIMIT 1),
      (SELECT o."id" FROM "organization" o ORDER BY o."createdAt", o."id" LIMIT 1)
    ) = ${organizationId}
  )`;
}

/**
 * Users of this organisation whose ROLE already carries a capacity code in the target flow — the
 * ladder, and HR, which reads the board. A direct grant or ALLOW override on one of them says
 * nothing their role does not already say, so clearing it would be noise in the report.
 */
function capacityRoleUsers(organizationId: string, flow: WorkspaceFlowName): Prisma.Sql {
  return Prisma.sql`(
    SELECT ur."userId" FROM "user_role" ur
    JOIN "role" r ON r."id" = ur."roleId"
    WHERE r."organizationId" = ${organizationId} AND r."name" IN (${Prisma.join([...capacityRolesFor(flow)])})
  )`;
}

const capacityCodesSql = Prisma.join([...CAPACITY_CODES]);

/**
 * Every flow's work, counted, for one organisation. The whole promise of a conversion is that this
 * comes out the same before and after, so it counts the things a conversion used to rewrite:
 * projects and clients, their tasks and time and staffing, the number registry, the PID pool and
 * the CID ledger.
 */
export async function workSnapshot(db: Db, organizationId: string): Promise<WorkSnapshot> {
  const [row] = await db.$queryRaw<Record<string, bigint>[]>`
    WITH op AS ${orgProjects(organizationId)},
         opt AS (SELECT DISTINCT pt."taskId", op."workspaceFlow"
                   FROM "project_task" pt JOIN op ON op."id" = pt."projectId")
    SELECT
      (SELECT count(*) FROM op WHERE op."workspaceFlow" = 'PROJECTS')                              AS p_projects,
      (SELECT count(*) FROM op WHERE op."workspaceFlow" = 'CLIENTS')                               AS c_projects,
      (SELECT count(*) FROM op WHERE op."workspaceFlow" = 'PROJECTS' AND op."deletedAt" IS NULL)   AS p_live,
      (SELECT count(*) FROM op WHERE op."workspaceFlow" = 'CLIENTS'  AND op."deletedAt" IS NULL)   AS c_live,
      (SELECT count(*) FROM op WHERE op."workspaceFlow" = 'PROJECTS' AND op."deletedAt" IS NULL
                                 AND op."code" IS NULL)                                            AS p_nonum,
      (SELECT count(*) FROM op WHERE op."workspaceFlow" = 'CLIENTS'  AND op."deletedAt" IS NULL
                                 AND op."code" IS NULL)                                            AS c_nonum,
      (SELECT count(*) FROM opt WHERE opt."workspaceFlow" = 'PROJECTS')                            AS p_tasks,
      (SELECT count(*) FROM opt WHERE opt."workspaceFlow" = 'CLIENTS')                             AS c_tasks,
      (SELECT count(*) FROM "timesheet" ts WHERE
          ts."projectId" IN (SELECT op."id" FROM op WHERE op."workspaceFlow" = 'PROJECTS')
       OR ts."taskId"    IN (SELECT opt."taskId" FROM opt WHERE opt."workspaceFlow" = 'PROJECTS')) AS p_time,
      (SELECT count(*) FROM "timesheet" ts WHERE
          ts."projectId" IN (SELECT op."id" FROM op WHERE op."workspaceFlow" = 'CLIENTS')
       OR ts."taskId"    IN (SELECT opt."taskId" FROM opt WHERE opt."workspaceFlow" = 'CLIENTS'))  AS c_time,
      (SELECT count(*) FROM "task_assignee" ta
        WHERE ta."taskId" IN (SELECT opt."taskId" FROM opt WHERE opt."workspaceFlow" = 'PROJECTS'))AS p_staff,
      (SELECT count(*) FROM "task_assignee" ta
        WHERE ta."taskId" IN (SELECT opt."taskId" FROM opt WHERE opt."workspaceFlow" = 'CLIENTS')) AS c_staff,
      (SELECT count(*) FROM "task" t JOIN "user" u ON u."id" = t."createdBy"
        WHERE u."organizationId" = ${organizationId}
          AND NOT EXISTS (SELECT 1 FROM "project_task" pt WHERE pt."taskId" = t."id"))             AS shared_tasks,
      (SELECT count(*) FROM "timesheet" ts JOIN "user" u ON u."id" = ts."userId"
        WHERE u."organizationId" = ${organizationId} AND ts."projectId" IS NULL
          AND (ts."taskId" IS NULL
               OR NOT EXISTS (SELECT 1 FROM "project_task" pt WHERE pt."taskId" = ts."taskId")))   AS shared_time,
      (SELECT count(*) FROM "cid_event" e WHERE e."organizationId" = ${organizationId})            AS cid_events`;

  const registry = await db.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT "status", count(*) AS n FROM "pid_reservation" WHERE "organizationId" = ${organizationId}
    GROUP BY "status" ORDER BY "status"`;
  const requests = await db.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT "status", count(*) AS n FROM "pid_request" WHERE "organizationId" = ${organizationId}
    GROUP BY "status" ORDER BY "status"`;

  const n = (k: string) => Number(row[k] ?? 0);
  return {
    projects: { PROJECTS: n('p_projects'), CLIENTS: n('c_projects') },
    liveProjects: { PROJECTS: n('p_live'), CLIENTS: n('c_live') },
    tasks: { PROJECTS: n('p_tasks'), CLIENTS: n('c_tasks') },
    timesheets: { PROJECTS: n('p_time'), CLIENTS: n('c_time') },
    staffing: { PROJECTS: n('p_staff'), CLIENTS: n('c_staff') },
    shared: { tasks: n('shared_tasks'), timesheets: n('shared_time') },
    withoutNumber: { PROJECTS: n('p_nonum'), CLIENTS: n('c_nonum') },
    registryByStatus: Object.fromEntries(registry.map(r => [r.status, Number(r.n)])),
    pidRequestsByStatus: Object.fromEntries(requests.map(r => [r.status, Number(r.n)])),
    cidEvents: n('cid_events'),
  };
}

export async function surveyOrg(db: Db, organizationId: string): Promise<ConversionSurvey> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, code: true, workspaceFlow: true, workspaceFlowChangedAt: true, timeTrackingMode: true },
  });
  if (!org) throw new WorkspaceFlowConversionError('NOT_FOUND', 'Organisation not found.');
  const inUse = await workspaceInUse(db, organizationId);
  const work = await workSnapshot(db, organizationId);

  const [counts] = await db.$queryRaw<{ clocks: bigint }[]>`
    SELECT (SELECT count(*) FROM "task_work_session" s JOIN "user" u ON u."id" = s."userId"
             WHERE u."organizationId" = ${organizationId} AND s."endedAt" IS NULL) AS clocks`;

  const roles = await db.$queryRaw<{ name: string; users: bigint; codes: string[] | null }[]>`
    SELECT r."name",
           (SELECT count(*) FROM "user_role" ur WHERE ur."roleId" = r."id") AS users,
           (SELECT array_agg(p."code" ORDER BY p."code") FROM "role_permission" rp JOIN "permission" p ON p."id" = rp."permissionId"
             WHERE rp."roleId" = r."id" AND p."code" IN (${capacityCodesSql})) AS codes
    FROM "role" r WHERE r."organizationId" = ${organizationId} ORDER BY r."name"`;

  const groups = await db.$queryRaw<{ name: string; codes: string[] }[]>`
    SELECT g."name", array_agg(p."code" ORDER BY p."code") AS codes
    FROM "permission_group" g
    JOIN "permission_group_permission" gp ON gp."groupId" = g."id"
    JOIN "permission" p ON p."id" = gp."permissionId"
    WHERE g."organizationId" = ${organizationId} AND p."code" IN (${capacityCodesSql})
    GROUP BY g."name" ORDER BY g."name"`;

  const [grants] = await db.$queryRaw<{ direct: bigint; allow: bigint; deny: bigint }[]>`
    SELECT
      (SELECT count(*) FROM "user_permission" up JOIN "user" u ON u."id" = up."userId" JOIN "permission" p ON p."id" = up."permissionId"
        WHERE u."organizationId" = ${organizationId} AND p."code" IN (${capacityCodesSql})) AS direct,
      (SELECT count(*) FROM "permission_override" po JOIN "user" u ON u."id" = po."userId" JOIN "permission" p ON p."id" = po."permissionId"
        WHERE u."organizationId" = ${organizationId} AND p."code" IN (${capacityCodesSql}) AND po."effect" = 'ALLOW') AS allow,
      (SELECT count(*) FROM "permission_override" po JOIN "user" u ON u."id" = po."userId" JOIN "permission" p ON p."id" = po."permissionId"
        WHERE u."organizationId" = ${organizationId} AND p."code" IN (${capacityCodesSql}) AND po."effect" = 'DENY') AS deny`;

  return {
    organization: {
      id: org.id, name: org.name, code: org.code,
      workspaceFlow: org.workspaceFlow === 'CLIENTS' ? 'CLIENTS' : 'PROJECTS',
      workspaceFlowChangedAt: org.workspaceFlowChangedAt ? org.workspaceFlowChangedAt.toISOString() : null,
      timeTrackingMode: org.timeTrackingMode,
    },
    inUse,
    work,
    runningClocks: Number(counts.clocks),
    capacity: {
      roles: roles.map(r => ({ name: r.name, users: Number(r.users), codes: r.codes ?? [] })),
      groups: groups.map(g => ({ name: g.name, codes: g.codes })),
      directGrants: Number(grants.direct),
      allowOverrides: Number(grants.allow),
      denyOverrides: Number(grants.deny),
    },
  };
}

// ── Steps ───────────────────────────────────────────────────────────────────────────────────────

type StepContext = {
  tx: Tx;
  organizationId: string;
  actorId: string;
  changeId: string;
  survey: ConversionSurvey;
};

async function toClients(ctx: StepContext): Promise<ConversionStep[]> {
  return [
    ...await closeClocksAndGoManual(ctx),
    await applyCapacity(ctx, 'CLIENTS'),
    workStaysWhereItIs(ctx, 'PROJECTS'),
    await flip(ctx, 'CLIENTS'),
  ];
}

async function toProjects(ctx: StepContext): Promise<ConversionStep[]> {
  return [
    await applyCapacity(ctx, 'PROJECTS'),
    {
      key: 'time_mode',
      label: 'Time stays as it is recorded now (an administrator may switch the PROJECTS flow to the timer afterwards)',
      changed: 0,
      details: { timeTrackingMode: ctx.survey.organization.timeTrackingMode },
    },
    workStaysWhereItIs(ctx, 'CLIENTS'),
    await flip(ctx, 'PROJECTS'),
  ];
}

/**
 * The step that does nothing, and is the most important one to say out loud: the flow being left
 * keeps every row it has. It is reported so that the person converting reads, in the same list as
 * the changes, exactly how much work is about to go out of sight and come back untouched.
 */
function workStaysWhereItIs({ survey }: StepContext, leaving: WorkspaceFlowName): ConversionStep {
  const w = survey.work;
  return {
    key: 'work_kept',
    label: `The ${leaving === 'CLIENTS' ? 'client' : 'project'} work stays exactly as it is — hidden while the other flow is on, and there again, unchanged, if the flow is switched back`,
    changed: 0,
    details: {
      projects: w.projects[leaving],
      liveProjects: w.liveProjects[leaving],
      tasks: w.tasks[leaving],
      timesheets: w.timesheets[leaving],
      staffing: w.staffing[leaving],
    },
  };
}

/** Close running clocks (minutes kept, capped at 12h) and move time to MANUAL, recorded as a switch. */
async function closeClocksAndGoManual({ tx, organizationId, actorId, survey }: StepContext): Promise<ConversionStep[]> {
  const closed = await tx.$queryRaw<{ minutes: number }[]>`
    UPDATE "task_work_session" s
       SET "endedAt" = ${NOW},
           "minutes" = LEAST(${CONVERSION_SESSION_CAP_MINUTES}::int,
                             GREATEST(0, ROUND(EXTRACT(EPOCH FROM (${NOW} - s."startedAt")) / 60)))::int
      FROM "user" u
     WHERE u."id" = s."userId" AND u."organizationId" = ${organizationId} AND s."endedAt" IS NULL
    RETURNING s."minutes"`;
  const timersClosed = closed.length;
  const minutesClosed = closed.reduce((a, r) => a + Number(r.minutes ?? 0), 0);

  const fromMode = survey.organization.timeTrackingMode === 'MANUAL' ? 'MANUAL' : 'TIMER';
  let modeChanged = 0;
  if (fromMode !== 'MANUAL') {
    await tx.$executeRaw`UPDATE "organization" SET "timeTrackingMode" = 'MANUAL' WHERE "id" = ${organizationId}`;
    await tx.timeTrackingModeChange.create({
      data: {
        organizationId, fromMode, toMode: 'MANUAL', changedBy: actorId,
        note: 'Workspace flow conversion to CLIENTS: time is logged from My Tasks.',
        timersClosed, minutesClosed,
      },
    });
    modeChanged = 1;
  }
  return [
    {
      key: 'clocks',
      label: 'Running clocks closed, their minutes kept (at most 12 hours each)',
      changed: timersClosed,
      details: { minutesClosed },
    },
    {
      key: 'time_mode',
      label: 'Time is recorded by hand (MANUAL), written to the time-mode history',
      changed: modeChanged,
      details: { from: fromMode, to: 'MANUAL' },
    },
  ];
}

/**
 * Team Capacity grants for a flow: roles to the flow's rule (capacityCodesFor), groups, direct
 * grants and ALLOW overrides cleared of what the flow does not hand out. DENY overrides stay.
 */
async function applyCapacity({ tx, organizationId }: StepContext, flow: WorkspaceFlowName): Promise<ConversionStep> {
  // The capacity.manage code exists on every migrated database; make sure of it on any other.
  await tx.$executeRaw`
    INSERT INTO "permission" ("id", "code", "name", "description")
    VALUES ('perm_capacity_manage', ${CAPACITY_MANAGE}, 'Team Capacity — Manage',
            'Create, edit, assign and delete tasks from Team Capacity')
    ON CONFLICT ("code") DO NOTHING`;
  const perms = await tx.permission.findMany({ where: { code: { in: [...CAPACITY_CODES] } }, select: { id: true, code: true } });
  const permId = new Map(perms.map(p => [p.code, p.id]));

  const roles = await tx.role.findMany({
    where: { organizationId },
    select: { id: true, name: true, rolePermissions: { where: { permission: { code: { in: [...CAPACITY_CODES] } } }, select: { permission: { select: { code: true } } } } },
    orderBy: { name: 'asc' },
  });
  const granted: string[] = [], revoked: string[] = [];
  for (const role of roles) {
    const want = new Set(capacityCodesFor(flow, role.name));
    const have = new Set(role.rolePermissions.map(rp => rp.permission.code));
    for (const code of CAPACITY_CODES) {
      const pid = permId.get(code);
      if (!pid) continue;
      if (want.has(code) && !have.has(code)) {
        await tx.$executeRaw`
          INSERT INTO "role_permission" ("id", "roleId", "permissionId")
          VALUES ('cap' || md5(${role.id}::text || ':' || ${code}::text), ${role.id}, ${pid})
          ON CONFLICT DO NOTHING`;
        granted.push(`${role.name}: ${code}`);
      } else if (!want.has(code) && have.has(code)) {
        await tx.$executeRaw`DELETE FROM "role_permission" WHERE "roleId" = ${role.id} AND "permissionId" = ${pid}`;
        revoked.push(`${role.name}: ${code}`);
      }
    }
  }

  // What groups, direct grants and ALLOW overrides may not carry in this flow.
  const barred = flow === 'CLIENTS' ? [...CAPACITY_CODES] : [CAPACITY_MANAGE];
  const barredSql = Prisma.join(barred);
  const groups = await tx.$queryRaw<{ name: string; code: string }[]>`
    DELETE FROM "permission_group_permission" gp
     USING "permission_group" g, "permission" p
     WHERE gp."groupId" = g."id" AND gp."permissionId" = p."id"
       AND g."organizationId" = ${organizationId} AND p."code" IN (${barredSql})
    RETURNING g."name", p."code"`;
  // CLIENTS: only for people whose role carries no capacity code anyway (a ladder member's or
  // HR's grant is redundant). PROJECTS: capacity.manage for anybody — that board has no task CRUD.
  const exempt = flow === 'CLIENTS' ? Prisma.sql`AND u."id" NOT IN ${capacityRoleUsers(organizationId, flow)}` : Prisma.empty;
  const direct = await tx.$queryRaw<{ email: string; code: string }[]>`
    DELETE FROM "user_permission" up
     USING "user" u, "permission" p
     WHERE up."userId" = u."id" AND up."permissionId" = p."id"
       AND u."organizationId" = ${organizationId} AND p."code" IN (${barredSql}) ${exempt}
    RETURNING u."email", p."code"`;
  const overrides = await tx.$queryRaw<{ email: string; code: string }[]>`
    DELETE FROM "permission_override" po
     USING "user" u, "permission" p
     WHERE po."userId" = u."id" AND po."permissionId" = p."id" AND po."effect" = 'ALLOW'
       AND u."organizationId" = ${organizationId} AND p."code" IN (${barredSql}) ${exempt}
    RETURNING u."email", p."code"`;

  const changed = granted.length + revoked.length + groups.length + direct.length + overrides.length;
  return {
    key: 'capacity',
    label: flow === 'CLIENTS'
      ? 'Team Capacity for the delivery ladder: capacity.view + capacity.manage for Super Admin, Admin, Manager, Senior Consultant; capacity.view for HR; removed from everyone else'
      : 'Team Capacity back to the PROJECTS presets: everyone sees the board, capacity.manage only through Super Admin',
    changed,
    details: {
      rolesGranted: granted,
      rolesRevoked: revoked,
      groupsRevoked: groups.map(g => `${g.name}: ${g.code}`),
      directGrantsRevoked: direct.map(d => `${d.email}: ${d.code}`),
      allowOverridesRevoked: overrides.map(o => `${o.email}: ${o.code}`),
    },
  };
}

async function flip({ tx, organizationId }: StepContext, to: WorkspaceFlowName): Promise<ConversionStep> {
  const n = await tx.$executeRaw`
    UPDATE "organization" SET "workspaceFlow" = ${to}, "workspaceFlowChangedAt" = ${NOW}, "updatedAt" = ${NOW}
     WHERE "id" = ${organizationId}`;
  return { key: 'flow', label: `The organisation now runs the ${to} flow`, changed: n };
}

// ── Verification ────────────────────────────────────────────────────────────────────────────────

function invariant(key: string, label: string, offenders: string[]): ConversionInvariant {
  return { key, label, ok: offenders.length === 0, found: offenders.length, ...(offenders.length ? { examples: offenders.slice(0, 10) } : {}) };
}

/** Every difference between two snapshots of the work, as sentences. Empty means nothing moved. */
export function workDifferences(before: WorkSnapshot, after: WorkSnapshot): string[] {
  const out: string[] = [];
  const cmp = (what: string, a: number, b: number) => { if (a !== b) out.push(`${what}: ${a} → ${b}`); };
  for (const flow of WORKSPACE_FLOW_NAMES) {
    cmp(`${flow} projects`, before.projects[flow], after.projects[flow]);
    cmp(`${flow} live projects`, before.liveProjects[flow], after.liveProjects[flow]);
    cmp(`${flow} tasks`, before.tasks[flow], after.tasks[flow]);
    cmp(`${flow} timesheet entries`, before.timesheets[flow], after.timesheets[flow]);
    cmp(`${flow} staffing rows`, before.staffing[flow], after.staffing[flow]);
    cmp(`${flow} rows still without a number`, before.withoutNumber[flow], after.withoutNumber[flow]);
  }
  cmp('tasks belonging to no project', before.shared.tasks, after.shared.tasks);
  cmp('time logged against no project', before.shared.timesheets, after.shared.timesheets);
  cmp('CID ledger events', before.cidEvents, after.cidEvents);
  for (const key of new Set([...Object.keys(before.registryByStatus), ...Object.keys(after.registryByStatus)])) {
    cmp(`registry numbers ${key}`, before.registryByStatus[key] ?? 0, after.registryByStatus[key] ?? 0);
  }
  for (const key of new Set([...Object.keys(before.pidRequestsByStatus), ...Object.keys(after.pidRequestsByStatus)])) {
    cmp(`PID requests ${key}`, before.pidRequestsByStatus[key] ?? 0, after.pidRequestsByStatus[key] ?? 0);
  }
  return out;
}

/**
 * The invariants of `flow`, for one organisation. Read-only; used inside the conversion.
 *
 * `workBefore` is the count of both flows' work taken before the steps ran. Given one, the
 * verification also checks that not a single row of either flow's work moved — the promise that a
 * conversion is a settings change. Without one (an operator asking "does this organisation hold
 * together?") the rest is checked on its own.
 */
export async function verify(
  db: Db, organizationId: string, flow: WorkspaceFlowName, workBefore?: WorkSnapshot,
): Promise<ConversionVerification> {
  const out: ConversionInvariant[] = [];
  const org = await db.organization.findUnique({
    where: { id: organizationId }, select: { workspaceFlow: true, timeTrackingMode: true },
  });
  out.push(invariant('flow', `The organisation runs the ${flow} flow`, org?.workspaceFlow === flow ? [] : [String(org?.workspaceFlow)]));

  if (workBefore) {
    out.push(invariant(
      'work_untouched',
      'Not one project, client, task, timesheet, staffing row, number or ledger entry of either flow was changed',
      workDifferences(workBefore, await workSnapshot(db, organizationId)),
    ));
  }

  // The registry is shared by both flows, so each number is judged by the flow of the work it is
  // attached to. A number attached to nothing is the registry's own history and belongs to neither.
  const strayStates = await db.$queryRaw<{ label: string }[]>`
    WITH op AS ${orgProjects(organizationId)}
    SELECT rs."pid" || ' (' || rs."status" || ', ' || p."workspaceFlow" || ' work)' AS label
      FROM "pid_reservation" rs JOIN op p ON p."id" = rs."projectId"
     WHERE rs."organizationId" = ${organizationId}
       AND ((p."workspaceFlow" = 'PROJECTS' AND rs."status" <> ALL (${REGISTRY_STATUSES_BY_FLOW.PROJECTS}::text[]))
         OR (p."workspaceFlow" = 'CLIENTS'  AND rs."status" <> ALL (${REGISTRY_STATUSES_BY_FLOW.CLIENTS}::text[])))
     ORDER BY 1`;
  out.push(invariant('registry_states', 'Every number is in a state the flow that owns its work knows', strayStates.map(r => r.label)));

  const dup = await db.$queryRaw<{ label: string }[]>`
    SELECT upper("pid") AS label FROM "pid_reservation" WHERE "organizationId" = ${organizationId}
     GROUP BY upper("pid") HAVING count(*) > 1 ORDER BY 1`;
  out.push(invariant('registry_unique', 'No two registry rows share a number', dup.map(r => r.label)));

  // The CLIENTS rule, checked in both directions: the client work is expected to hold together
  // whether or not it is the work on screen today.
  const nocode = await db.$queryRaw<{ label: string }[]>`
    SELECT p."title" AS label FROM ${orgProjects(organizationId)} p
     WHERE p."workspaceFlow" = 'CLIENTS' AND p."deletedAt" IS NULL AND p."code" IS NULL ORDER BY p."createdAt"`;
  out.push(invariant('every_client_has_cid', 'Every live client in the clients flow has a CID', nocode.map(r => r.label)));

  if (flow === 'CLIENTS') {
    out.push(invariant('time_manual', 'Time is recorded by hand (MANUAL)', org?.timeTrackingMode === 'MANUAL' ? [] : [String(org?.timeTrackingMode)]));

    const clocks = await db.$queryRaw<{ label: string }[]>`
      SELECT u."email" AS label FROM "task_work_session" s JOIN "user" u ON u."id" = s."userId"
       WHERE u."organizationId" = ${organizationId} AND s."endedAt" IS NULL`;
    out.push(invariant('no_running_clock', 'No clock is running', clocks.map(r => r.label)));
  }

  // Team Capacity, both flows: every role holds exactly its flow's capacity codes …
  const roles = await db.role.findMany({
    where: { organizationId },
    select: { name: true, rolePermissions: { where: { permission: { code: { in: [...CAPACITY_CODES] } } }, select: { permission: { select: { code: true } } } } },
  });
  const wrongRoles: string[] = [];
  for (const r of roles) {
    const want = capacityCodesFor(flow, r.name).sort().join(',');
    const have = r.rolePermissions.map(x => x.permission.code).sort().join(',');
    if (want !== have) wrongRoles.push(`${r.name}: holds [${have}], should hold [${want}]`);
  }
  out.push(invariant('capacity_roles', flow === 'CLIENTS'
    ? 'Team Capacity roles: view + manage for the four ladder roles, view for HR, nothing for any other role'
    : 'Team Capacity roles: every role sees the board; manage only through Super Admin', wrongRoles));

  // … and nothing else hands out what the flow does not.
  const barred = Prisma.join(flow === 'CLIENTS' ? [...CAPACITY_CODES] : [CAPACITY_MANAGE]);
  const exempt = flow === 'CLIENTS' ? Prisma.sql`AND u."id" NOT IN ${capacityRoleUsers(organizationId, flow)}` : Prisma.empty;
  const groups = await db.$queryRaw<{ label: string }[]>`
    SELECT g."name" || ': ' || p."code" AS label FROM "permission_group_permission" gp
      JOIN "permission_group" g ON g."id" = gp."groupId" JOIN "permission" p ON p."id" = gp."permissionId"
     WHERE g."organizationId" = ${organizationId} AND p."code" IN (${barred})`;
  out.push(invariant('capacity_groups', 'No permission group hands out a capacity code the flow reserves', groups.map(r => r.label)));
  const direct = await db.$queryRaw<{ label: string }[]>`
    SELECT u."email" || ': ' || p."code" || ' (' || kind || ')' AS label FROM (
      SELECT up."userId", up."permissionId", 'direct grant' AS kind FROM "user_permission" up
      UNION ALL
      SELECT po."userId", po."permissionId", 'ALLOW override' FROM "permission_override" po WHERE po."effect" = 'ALLOW'
    ) g JOIN "user" u ON u."id" = g."userId" JOIN "permission" p ON p."id" = g."permissionId"
     WHERE u."organizationId" = ${organizationId} AND p."code" IN (${barred}) ${exempt}`;
  out.push(invariant('capacity_people', flow === 'CLIENTS'
    ? 'Nobody whose role carries no capacity code holds one directly or by an ALLOW override'
    : 'Nobody holds capacity.manage directly or by an ALLOW override', direct.map(r => r.label)));

  return { flow, ok: out.every(i => i.ok), invariants: out };
}

/** JSON-safe copy for a Json column (bigint-free by construction; Dates become strings). */
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
