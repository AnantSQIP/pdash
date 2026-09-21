/**
 * CHANGING AN ORGANISATION'S WORKSPACE FLOW — PROJECTS ⇄ CLIENTS (docs/WORKSPACE_FLOWS.md).
 *
 * A flow in use has data shaped for it, so a change of flow is a CONVERSION, not a toggle: the
 * data one flow relies on is put into the shape the other expects, the new flow's invariants are
 * checked, and only then does the organisation's `workspaceFlow` change. This module is the ONE
 * implementation. The API (Settings → Workspace flow) and the operator CLI
 * (packages/db/prisma/convert-workspace-flow.ts) both call it, so the SQL exists once.
 *
 * WHAT A CONVERSION IS
 *
 *   one transaction, all or nothing:
 *     1. an org-scoped advisory lock (two conversions of one organisation can never interleave;
 *        the second is refused, not queued) and the organisation row FOR UPDATE, re-read;
 *     2. the tables the steps touch are locked against writers (SHARE ROW EXCLUSIVE — reads carry
 *        on), so nothing can be created in the old shape while the conversion runs: no clock
 *        started, no PID generated, no project created without a number, no grant slipped in;
 *     3. a survey of what is there (stored as the conversion's "preflight");
 *     4. the steps (below), each reporting what it changed;
 *     5. the new flow's invariants, checked INSIDE the transaction. One failing rolls the whole
 *        conversion back and the report says which, with examples;
 *     6. the workspace_flow_change row (survey, steps, verification) and, from the caller, the
 *        audit event — in the same transaction, so the record exists exactly when the change does.
 *
 *   The preflight is the same code run as a DRY RUN: the transaction is always rolled back, so
 *   "what will change" is not an estimate — it is what the conversion does, counted, and whether
 *   its verification would pass. Nothing is written.
 *
 * PROJECTS → CLIENTS
 *   · running clocks closed (minutes kept, capped at 12h) and time set to MANUAL, recorded in the
 *     time-mode history like an admin's switch;
 *   · PENDING PID requests cancelled;
 *   · the number registry (pid_reservation): a code a project carries with no registry row gets
 *     one; RESERVED / RELEASED / EXPIRED → DISCONTINUED (shown once, never re-issued); every row's
 *     status re-read from the projects carrying it (live → ATTACHED, only deleted → DELETED,
 *     none and was ATTACHED → PURGED); every number written to the CID ledger as IMPORTED;
 *   · every live project without a number gets the next CID (oldest first; the FY it was created
 *     in, Indian FY read in IST; one past the highest serial EVER used), recorded as BACKFILLED;
 *   · Team Capacity: capacity.view + capacity.manage for the delivery ladder (Super Admin, Admin,
 *     Manager, Senior Consultant); both codes removed from every other role, every permission
 *     group, and the direct grants / ALLOW overrides of people on none of the ladder roles
 *     (DENY overrides are someone's decision about someone, and stay).
 *
 * CLIENTS → PROJECTS
 *   · Team Capacity back to the PROJECTS presets: every role holds capacity.view, only a '*'
 *     preset (Super Admin) holds capacity.manage; capacity.manage removed from groups, direct
 *     grants and ALLOW overrides;
 *   · registry states PROJECTS does not know: DELETED → ATTACHED; PURGED / MERGED → DISCONTINUED
 *     (the merge target is kept in the report; the ledger keeps the history);
 *   · time stays MANUAL; the CID ledger, client groups, task-group fields and billable flags stay.
 *
 * TENANCY. `project` has no organisation column. A project belongs to its creator's
 * organisation, else to that of its earliest member, else to the first organisation — the rule
 * CidService.orgForProject and the old SQL backfill use. Every statement here is scoped to ONE
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

/** Longest prefix a CID may carry — CID_PREFIX_MAX in apps/api/src/common/cid/cid.ts. */
export const CONVERSION_CID_PREFIX_MAX = 16;
/** cidPrefix(): letters and digits of the organisation code, upper-cased, ≤16, 'SQ' if nothing is left. */
export function conversionCidPrefix(orgCode: string | null | undefined): string {
  const clean = (orgCode ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CONVERSION_CID_PREFIX_MAX);
  return clean || 'SQ';
}

/** The Indian financial year (April start) an instant falls in, read in IST — financialYear().label. */
export function istFinancialYearLabel(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' })
    .formatToParts(instant);
  const y = Number(parts.find(p => p.type === 'year')!.value);
  const m = Number(parts.find(p => p.type === 'month')!.value);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}_${String((start + 1) % 100).padStart(2, '0')}`;
}

/** PREFIX_YY_YY_NNN — formatCid(). */
export function conversionFormatCid(prefix: string, fyLabel: string, serial: number): string {
  return `${prefix}_${fyLabel}_${String(serial).padStart(3, '0')}`;
}

/** A code that can be put in the registry: anything_YY_YY_serial (serial ≥ 1). PROJECTS PIDs may
 *  carry an unsanitised prefix (`pdash-demo_26_27_001`), so the prefix is not constrained. */
export function parseLegacyNumber(code: string): { fyLabel: string; serial: number } | null {
  const m = /^.+_(\d{2})_(\d{2})_(\d{1,6})$/.exec(code ?? '');
  if (!m) return null;
  const serial = parseInt(m[3], 10);
  if (serial < 1) return null;
  return { fyLabel: `${m[1]}_${m[2]}`, serial };
}

/** One past the highest serial ever seen — the whole of "never re-issued". */
export function nextSerialAfter(...seen: Array<number | null | undefined>): number {
  return Math.max(0, ...seen.map(n => Number(n ?? 0)).filter(n => Number.isFinite(n))) + 1;
}

/** A clock nobody stopped stops counting after this — SESSION_CAP_MINUTES in common/work-time.ts. */
export const CONVERSION_SESSION_CAP_MINUTES = 12 * 60;

export const CAPACITY_VIEW = 'capacity.view';
export const CAPACITY_MANAGE = 'capacity.manage';
export const CAPACITY_CODES = [CAPACITY_VIEW, CAPACITY_MANAGE] as const;

/** The delivery ladder: who holds Team Capacity in the CLIENTS flow (CLIENTS presets). */
export const DELIVERY_LADDER_ROLES = ['Super Admin', 'Admin', 'Manager', 'Senior Consultant'] as const;
/** Roles whose preset is '*' (every code) in both flows. */
export const ALL_CODES_ROLES = ['Super Admin'] as const;

/**
 * The capacity codes a role holds in a flow — rolePresetsFor(flow) restricted to the two capacity
 * codes, and the rule for a role no preset names (a custom role): none in CLIENTS (the board is
 * the ladder's), capacity.view in PROJECTS (everyone sees the board). Pinned against the catalog
 * by tools/workspace-flow-conversion.spec.ts, so the presets and the conversion cannot drift.
 */
export function capacityCodesFor(flow: WorkspaceFlowName, roleName: string): string[] {
  if (flow === 'CLIENTS') {
    return (DELIVERY_LADDER_ROLES as readonly string[]).includes(roleName) ? [CAPACITY_VIEW, CAPACITY_MANAGE] : [];
  }
  return (ALL_CODES_ROLES as readonly string[]).includes(roleName) ? [CAPACITY_VIEW, CAPACITY_MANAGE] : [CAPACITY_VIEW];
}

/** The registry states each flow knows. The database CHECK holds their union. */
export const REGISTRY_STATUSES_BY_FLOW: Record<WorkspaceFlowName, readonly string[]> = {
  PROJECTS: ['RESERVED', 'ATTACHED', 'RELEASED', 'EXPIRED', 'DISCONTINUED'],
  CLIENTS: ['ATTACHED', 'DELETED', 'PURGED', 'MERGED', 'DISCONTINUED'],
};

const TERMINAL_PHASES = ['COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED'];

/** The advisory-lock key a conversion (or its dry run) holds for its organisation. */
export const conversionLockKey = (organizationId: string) => `workspace-flow:${organizationId}`;
/** The key CidService.lockSeries takes to issue a CID — the backfill takes the same one. */
const cidSeriesLockKey = (organizationId: string, fyLabel: string) => `cid:${organizationId}:${fyLabel}`;

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

export type ConversionSurvey = {
  organization: {
    id: string; name: string; code: string;
    workspaceFlow: WorkspaceFlowName; workspaceFlowChangedAt: string | null; timeTrackingMode: string;
  };
  inUse: { projects: number; liveProjects: number; tasks: number; timesheets: number; any: boolean };
  liveProjectsWithoutNumber: number;
  registryByStatus: Record<string, number>;
  pendingPidRequests: number;
  runningClocks: number;
  cidEvents: number;
  /** Codes projects carry that no registry row names and that cannot be registered. */
  unregisterableCodes: string[];
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
  /** Is the organisation using its current flow at all? False → nothing to convert. */
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
   * nothing to convert. Checked again inside the transaction: if it is in use by then, refused.
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

      // Writers wait; readers carry on. Held until commit, so nothing is created in the old shape
      // between the steps and the verification, or after the verification and before the flip.
      await tx.$executeRawUnsafe(
        `LOCK TABLE "project", "pid_reservation", "pid_request", "cid_event", "task_work_session",
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
      const blockers = hardBlockers(survey, to);
      if (blockers.length) {
        const report: ConversionReport = { ...base, steps: [], verification: { flow: to, ok: false, invariants: [] }, blockers };
        throw new WorkspaceFlowConversionError('BLOCKED', blockers.map(b => b.message).join(' '), report, blockers);
      }

      const changeId = dryRun ? 'dry-run' : `wfc_${randomUUID().replace(/-/g, '')}`;
      const ctx: StepContext = { tx, organizationId, actorId: input.actorId, changeId, survey };
      const steps = to === 'CLIENTS' ? await toClients(ctx) : await toProjects(ctx);
      const verification = await verify(tx, organizationId, to);

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

/** What stops a conversion before it starts (the dry run adds anything its verification finds). */
function hardBlockers(survey: ConversionSurvey, to: WorkspaceFlowName): ConversionBlocker[] {
  const out: ConversionBlocker[] = [];
  if (to === 'CLIENTS' && survey.unregisterableCodes.length) {
    out.push({
      code: 'UNREGISTERABLE_CODES',
      message:
        `${survey.unregisterableCodes.length} project number(s) are not in the form PREFIX_YY_YY_NNN, so the CID `
        + 'registry cannot hold them. Give those projects a proper number (Change PID) first.',
      examples: survey.unregisterableCodes.slice(0, 10),
    });
  }
  return out;
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

/** Users of this organisation holding at least one role on the delivery ladder. */
function ladderUsers(organizationId: string): Prisma.Sql {
  return Prisma.sql`(
    SELECT ur."userId" FROM "user_role" ur
    JOIN "role" r ON r."id" = ur."roleId"
    WHERE r."organizationId" = ${organizationId} AND r."name" IN (${Prisma.join([...DELIVERY_LADDER_ROLES])})
  )`;
}

const capacityCodesSql = Prisma.join([...CAPACITY_CODES]);

export async function surveyOrg(db: Db, organizationId: string): Promise<ConversionSurvey> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, code: true, workspaceFlow: true, workspaceFlowChangedAt: true, timeTrackingMode: true },
  });
  if (!org) throw new WorkspaceFlowConversionError('NOT_FOUND', 'Organisation not found.');
  const inUse = await workspaceInUse(db, organizationId);

  const [counts] = await db.$queryRaw<{ nocode: bigint; pending: bigint; clocks: bigint; events: bigint }[]>`
    SELECT
      (SELECT count(*) FROM ${orgProjects(organizationId)} p WHERE p."deletedAt" IS NULL AND p."code" IS NULL) AS nocode,
      (SELECT count(*) FROM "pid_request" r WHERE r."organizationId" = ${organizationId} AND r."status" = 'PENDING') AS pending,
      (SELECT count(*) FROM "task_work_session" s JOIN "user" u ON u."id" = s."userId"
        WHERE u."organizationId" = ${organizationId} AND s."endedAt" IS NULL) AS clocks,
      (SELECT count(*) FROM "cid_event" e WHERE e."organizationId" = ${organizationId}) AS events`;

  const byStatus = await db.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT "status", count(*) AS n FROM "pid_reservation" WHERE "organizationId" = ${organizationId}
    GROUP BY "status" ORDER BY "status"`;

  const unregistered = await db.$queryRaw<{ code: string }[]>`
    SELECT DISTINCT p."code" FROM ${orgProjects(organizationId)} p
    WHERE p."code" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "pid_reservation" r WHERE r."organizationId" = ${organizationId} AND r."pid" = p."code")
    ORDER BY p."code"`;

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
    liveProjectsWithoutNumber: Number(counts.nocode),
    registryByStatus: Object.fromEntries(byStatus.map(r => [r.status, Number(r.n)])),
    pendingPidRequests: Number(counts.pending),
    runningClocks: Number(counts.clocks),
    cidEvents: Number(counts.events),
    unregisterableCodes: unregistered.map(r => r.code).filter(c => !parseLegacyNumber(c)),
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
  const steps: ConversionStep[] = [];
  steps.push(...await closeClocksAndGoManual(ctx));
  steps.push(await cancelPidRequests(ctx));
  steps.push(await registerCarriedCodes(ctx));
  steps.push(await retireHolds(ctx));
  steps.push(await rederiveRegistry(ctx));
  steps.push(await importNumbersToLedger(ctx));
  steps.push(await backfillCids(ctx));
  steps.push(await applyCapacity(ctx, 'CLIENTS'));
  steps.push(await flip(ctx, 'CLIENTS'));
  return steps;
}

async function toProjects(ctx: StepContext): Promise<ConversionStep[]> {
  const steps: ConversionStep[] = [];
  steps.push(await applyCapacity(ctx, 'PROJECTS'));
  steps.push(await mapRegistryToProjects(ctx));
  steps.push({
    key: 'time_mode',
    label: 'Time stays as it is recorded now (an administrator may switch the PROJECTS flow to the timer afterwards)',
    changed: 0,
    details: { timeTrackingMode: ctx.survey.organization.timeTrackingMode },
  });
  steps.push({
    key: 'kept',
    label: 'The CID ledger, client groups, task-group fields and billable flags stay in the database, unused',
    changed: 0,
    details: { cidEvents: ctx.survey.cidEvents },
  });
  steps.push(await flip(ctx, 'PROJECTS'));
  return steps;
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

async function cancelPidRequests({ tx, organizationId }: StepContext): Promise<ConversionStep> {
  const rows = await tx.$queryRaw<{ title: string | null }[]>`
    UPDATE "pid_request" r SET "status" = 'CANCELLED', "resolvedAt" = ${NOW}
      FROM "project" p
     WHERE p."id" = r."projectId" AND r."organizationId" = ${organizationId} AND r."status" = 'PENDING'
    RETURNING p."title"`;
  return {
    key: 'pid_requests',
    label: 'Open PID requests cancelled (the CLIENTS flow issues numbers itself)',
    changed: rows.length,
    details: { projects: rows.map(r => r.title).slice(0, 50) },
  };
}

/** A code a project carries but the registry does not name gets its row, so it is never re-issued. */
async function registerCarriedCodes({ tx, organizationId }: StepContext): Promise<ConversionStep> {
  const rows = await tx.$queryRaw<{ pid: string }[]>`
    INSERT INTO "pid_reservation" ("id", "organizationId", "fyLabel", "serial", "pid", "generatedById",
                                   "status", "projectId", "createdAt", "resolvedAt")
    SELECT DISTINCT ON (p."code")
           'lg' || md5(${organizationId}::text || ':' || p."code"), ${organizationId},
           (regexp_match(p."code", '_([0-9]{2}_[0-9]{2})_[0-9]{1,6}$'))[1],
           ((regexp_match(p."code", '_([0-9]{1,6})$'))[1])::int,
           p."code", COALESCE(p."createdBy", 'system'), 'ATTACHED', p."id", p."createdAt", ${NOW}
      FROM ${orgProjects(organizationId)} p
     WHERE p."code" IS NOT NULL
       AND p."code" ~ '^.+_[0-9]{2}_[0-9]{2}_[0-9]{1,6}$'
       AND ((regexp_match(p."code", '_([0-9]{1,6})$'))[1])::int >= 1
       AND NOT EXISTS (SELECT 1 FROM "pid_reservation" r WHERE r."organizationId" = ${organizationId} AND r."pid" = p."code")
     ORDER BY p."code", p."createdAt", p."id"
    ON CONFLICT DO NOTHING
    RETURNING "pid"`;
  return {
    key: 'registry_register',
    label: 'Numbers carried by projects but missing from the registry registered',
    changed: rows.length,
    details: { numbers: rows.map(r => r.pid).slice(0, 50) },
  };
}

/** A number generated and never attached was shown to somebody — it is retired, never re-issued. */
async function retireHolds({ tx, organizationId }: StepContext): Promise<ConversionStep> {
  const rows = await tx.$queryRaw<{ pid: string; was: string }[]>`
    WITH was AS (
      SELECT "id", "status" FROM "pid_reservation"
       WHERE "organizationId" = ${organizationId} AND "status" IN ('RESERVED', 'RELEASED', 'EXPIRED')
    )
    UPDATE "pid_reservation" r
       SET "status" = 'DISCONTINUED', "resolvedAt" = COALESCE(r."resolvedAt", ${NOW})
      FROM was WHERE r."id" = was."id"
    RETURNING r."pid", was."status" AS was`;
  const byStatus: Record<string, number> = {};
  rows.forEach(r => { byStatus[r.was] = (byStatus[r.was] ?? 0) + 1; });
  return {
    key: 'registry_retire',
    label: 'Numbers reserved, released or expired but never attached retired (DISCONTINUED)',
    changed: rows.length,
    details: { byStatus, numbers: rows.map(r => r.pid).slice(0, 50) },
  };
}

/** Every number's status read off the projects that carry it. */
async function rederiveRegistry({ tx, organizationId }: StepContext): Promise<ConversionStep> {
  const rows = await tx.$queryRaw<{ pid: string; was: string; now: string }[]>`
    WITH op AS ${orgProjects(organizationId)},
    want AS (
      SELECT rs."id", rs."status" AS was, rs."projectId" AS was_project,
             CASE WHEN live."id" IS NOT NULL THEN 'ATTACHED'
                  WHEN dead."id" IS NOT NULL THEN 'DELETED'
                  WHEN rs."status" = 'ATTACHED' THEN 'PURGED'
                  ELSE rs."status" END AS now_status,
             CASE WHEN live."id" IS NOT NULL THEN live."id"
                  WHEN dead."id" IS NOT NULL THEN dead."id"
                  WHEN rs."status" = 'ATTACHED' THEN NULL
                  ELSE rs."projectId" END AS now_project
        FROM "pid_reservation" rs
        LEFT JOIN LATERAL (
          SELECT p."id" FROM op p WHERE p."code" = rs."pid" AND p."deletedAt" IS NULL
           ORDER BY (p."projectPhase" IN (${Prisma.join(TERMINAL_PHASES)})), p."roundSeq" DESC, p."id" DESC LIMIT 1
        ) live ON true
        LEFT JOIN LATERAL (
          SELECT p."id" FROM op p WHERE p."code" = rs."pid"
           ORDER BY p."deletedAt" DESC NULLS LAST, p."id" DESC LIMIT 1
        ) dead ON true
       WHERE rs."organizationId" = ${organizationId}
    )
    UPDATE "pid_reservation" r
       SET "status" = w.now_status,
           "projectId" = w.now_project,
           "mergedIntoCid" = CASE WHEN w.now_status = 'MERGED' THEN r."mergedIntoCid" ELSE NULL END,
           "resolvedAt" = CASE WHEN w.now_status = 'PURGED' THEN COALESCE(r."resolvedAt", ${NOW}) ELSE r."resolvedAt" END
      FROM want w
     WHERE r."id" = w."id"
       AND (w.now_status IS DISTINCT FROM w.was OR w.now_project IS DISTINCT FROM w.was_project)
    RETURNING r."pid", w.was, w.now_status AS now`;
  const moves: Record<string, number> = {};
  rows.forEach(r => { const k = `${r.was}→${r.now}`; moves[k] = (moves[k] ?? 0) + 1; });
  return {
    key: 'registry_rederive',
    label: 'Every number’s status re-read from the projects carrying it (ATTACHED / DELETED / PURGED)',
    changed: rows.length,
    details: { moves, numbers: rows.map(r => `${r.pid}: ${r.was} → ${r.now}`).slice(0, 50) },
  };
}

/** Every existing number gets one IMPORTED ledger event, dated when it was issued. Idempotent ids. */
async function importNumbersToLedger({ tx, organizationId, changeId }: StepContext): Promise<ConversionStep> {
  const rows = await tx.$queryRaw<{ cid: string }[]>`
    INSERT INTO "cid_event" ("id", "organizationId", "cid", "projectId", "clientTitle", "type", "toCid",
                             "actorId", "actorName", "metadata", "createdAt")
    SELECT 'imp' || md5(rs."organizationId" || ':' || rs."pid"), rs."organizationId", rs."pid", rs."projectId",
           (SELECT p."title" FROM ${orgProjects(organizationId)} p WHERE p."code" = rs."pid"
             ORDER BY p."roundSeq", p."createdAt" LIMIT 1),
           'IMPORTED', rs."pid", u."id",
           CASE WHEN u."id" IS NOT NULL THEN trim(u."firstName" || ' ' || u."lastName") ELSE 'System' END,
           jsonb_build_object('note', 'Issued before the CID ledger existed; recorded by the workspace-flow conversion',
                              'statusAtImport', rs."status", 'conversionId', ${changeId}::text),
           rs."createdAt"
      FROM "pid_reservation" rs
      LEFT JOIN "user" u ON u."id" = rs."generatedById"
     WHERE rs."organizationId" = ${organizationId}
       AND NOT EXISTS (SELECT 1 FROM "cid_event" e WHERE e."organizationId" = rs."organizationId" AND e."cid" = rs."pid")
    ON CONFLICT ("id") DO NOTHING
    RETURNING "cid"`;
  return {
    key: 'ledger_import',
    label: 'Every existing number written to the CID ledger (IMPORTED)',
    changed: rows.length,
    details: { numbers: rows.map(r => r.cid).slice(0, 50) },
  };
}

/** The highest serial this organisation has EVER used in a financial year — every source counts. */
async function highestSerial(tx: Tx, organizationId: string, fyLabel: string, prefix: string): Promise<number> {
  const head = `${prefix}_${fyLabel}_`;
  const [row] = await tx.$queryRaw<{ reg: number | null; coded: number | null; own: number | null; counter: number | null }[]>`
    SELECT
      (SELECT MAX("serial") FROM "pid_reservation" WHERE "organizationId" = ${organizationId} AND "fyLabel" = ${fyLabel}) AS reg,
      (SELECT MAX(substr(p."code", ${head.length + 1}::int)::int) FROM "project" p
        WHERE starts_with(p."code", ${head}) AND substr(p."code", ${head.length + 1}::int) ~ '^[0-9]{1,6}$') AS coded,
      (SELECT MAX(((regexp_match(p."code", '_([0-9]{1,6})$'))[1])::int) FROM ${orgProjects(organizationId)} p
        WHERE p."code" ~ ${`^.+_${fyLabel}_[0-9]{1,6}$`}) AS own,
      (SELECT "value" FROM "sequence_counter" WHERE "scope" = ${`pid:${organizationId}:${fyLabel}`}) AS counter`;
  return nextSerialAfter(row?.reg, row?.coded, row?.own, row?.counter) - 1;
}

/** Every live project without a number gets the next CID, oldest first, in the FY it was created in. */
async function backfillCids({ tx, organizationId, actorId, changeId, survey }: StepContext): Promise<ConversionStep> {
  const pending = await tx.$queryRaw<{ id: string; title: string; createdAt: Date; createdBy: string | null }[]>`
    SELECT p."id", p."title", p."createdAt", p."createdBy" FROM ${orgProjects(organizationId)} p
     WHERE p."deletedAt" IS NULL AND p."code" IS NULL
     ORDER BY p."createdAt", p."id"`;
  const prefix = conversionCidPrefix(survey.organization.code);
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, firstName: true, lastName: true } });
  const issued: string[] = [];
  const locked = new Set<string>();
  for (const p of pending) {
    const fyLabel = istFinancialYearLabel(p.createdAt);
    if (!locked.has(fyLabel)) {
      // The lock CidService takes to issue a CID, so a client created the moment the flow flips
      // queues behind the backfill instead of reading the same "highest serial".
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${cidSeriesLockKey(organizationId, fyLabel)}))::text AS locked`;
      locked.add(fyLabel);
    }
    const serial = (await highestSerial(tx, organizationId, fyLabel, prefix)) + 1;
    const cid = conversionFormatCid(prefix, fyLabel, serial);
    await tx.$executeRaw`
      INSERT INTO "pid_reservation" ("id", "organizationId", "fyLabel", "serial", "pid", "generatedById",
                                     "status", "projectId", "createdAt", "resolvedAt")
      VALUES ('bf' || md5(${organizationId}::text || ':' || ${cid}::text), ${organizationId}, ${fyLabel}, ${serial}::int, ${cid},
              ${p.createdBy ?? 'system'}, 'ATTACHED', ${p.id}, ${NOW}, ${NOW})`;
    const updated = await tx.$executeRaw`
      UPDATE "project" SET "code" = ${cid}, "roundSeq" = 1 WHERE "id" = ${p.id} AND "code" IS NULL`;
    if (updated !== 1) throw new Error(`Project ${p.id} changed while its CID was being issued.`);
    await tx.$executeRaw`
      INSERT INTO "cid_event" ("id", "organizationId", "cid", "projectId", "clientTitle", "type", "toCid",
                               "actorId", "actorName", "metadata", "createdAt")
      VALUES ('bfe' || md5(${organizationId}::text || ':' || ${cid}::text || ':' || ${p.id}::text), ${organizationId}, ${cid}, ${p.id}, ${p.title},
              'BACKFILLED', ${cid}, ${actor?.id ?? null},
              ${actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'System (workspace-flow conversion)'},
              jsonb_build_object('via', 'workspace-flow conversion', 'conversionId', ${changeId}::text,
                                 'clientCreatedAt', ${p.createdAt.toISOString()}::text, 'clientCreatedBy', ${p.createdBy}::text,
                                 'order', 'createdAt, then id'),
              ${NOW})`;
    issued.push(`${p.title} → ${cid}`);
  }
  return {
    key: 'cid_backfill',
    label: 'Every live project without a number given the next CID (oldest first), recorded as BACKFILLED',
    changed: pending.length,
    details: { prefix, issued: issued.slice(0, 100) },
  };
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
  // CLIENTS: only for people on none of the ladder roles (a ladder member's grant is redundant).
  // PROJECTS: capacity.manage for anybody — the PROJECTS board has no task CRUD to grant.
  const exempt = flow === 'CLIENTS' ? Prisma.sql`AND u."id" NOT IN ${ladderUsers(organizationId)}` : Prisma.empty;
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
      ? 'Team Capacity for Senior Consultant and above: capacity.view + capacity.manage for Super Admin, Admin, Manager, Senior Consultant; removed from everyone else'
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

/** Registry states PROJECTS does not know become ones it does; the merge target is kept here. */
async function mapRegistryToProjects({ tx, organizationId }: StepContext): Promise<ConversionStep> {
  const rows = await tx.$queryRaw<{ pid: string; was: string; merged: string | null; now: string }[]>`
    WITH was AS (
      SELECT "id", "status", "mergedIntoCid" FROM "pid_reservation"
       WHERE "organizationId" = ${organizationId} AND "status" IN ('DELETED', 'PURGED', 'MERGED')
    )
    UPDATE "pid_reservation" r
       SET "status" = CASE WHEN was."status" = 'DELETED' THEN 'ATTACHED' ELSE 'DISCONTINUED' END,
           "mergedIntoCid" = NULL,
           "resolvedAt" = COALESCE(r."resolvedAt", ${NOW})
      FROM was WHERE r."id" = was."id"
    RETURNING r."pid", was."status" AS was, was."mergedIntoCid" AS merged, r."status" AS now`;
  const moves: Record<string, number> = {};
  rows.forEach(r => { const k = `${r.was}→${r.now}`; moves[k] = (moves[k] ?? 0) + 1; });
  return {
    key: 'registry_map',
    label: 'Registry states PROJECTS does not know mapped: DELETED → ATTACHED, PURGED / MERGED → DISCONTINUED',
    changed: rows.length,
    details: {
      moves,
      mergedInto: rows.filter(r => r.merged).map(r => `${r.pid} → ${r.merged}`),
      numbers: rows.map(r => `${r.pid}: ${r.was} → ${r.now}`).slice(0, 50),
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

/** The invariants of `flow`, for one organisation. Read-only; used inside the conversion. */
export async function verify(db: Db, organizationId: string, flow: WorkspaceFlowName): Promise<ConversionVerification> {
  const out: ConversionInvariant[] = [];
  const org = await db.organization.findUnique({
    where: { id: organizationId }, select: { workspaceFlow: true, timeTrackingMode: true },
  });
  out.push(invariant('flow', `The organisation runs the ${flow} flow`, org?.workspaceFlow === flow ? [] : [String(org?.workspaceFlow)]));

  const allowed = REGISTRY_STATUSES_BY_FLOW[flow];
  const stray = await db.$queryRaw<{ label: string }[]>`
    SELECT "pid" || ' (' || "status" || ')' AS label FROM "pid_reservation"
     WHERE "organizationId" = ${organizationId} AND "status" NOT IN (${Prisma.join([...allowed])}) ORDER BY "pid"`;
  out.push(invariant('registry_states', `Every registry number is in a state the ${flow} flow knows (${allowed.join(', ')})`, stray.map(r => r.label)));

  const dup = await db.$queryRaw<{ label: string }[]>`
    SELECT upper("pid") AS label FROM "pid_reservation" WHERE "organizationId" = ${organizationId}
     GROUP BY upper("pid") HAVING count(*) > 1 ORDER BY 1`;
  out.push(invariant('registry_unique', 'No two registry rows share a number', dup.map(r => r.label)));

  if (flow === 'CLIENTS') {
    const nocode = await db.$queryRaw<{ label: string }[]>`
      SELECT p."title" AS label FROM ${orgProjects(organizationId)} p
       WHERE p."deletedAt" IS NULL AND p."code" IS NULL ORDER BY p."createdAt"`;
    out.push(invariant('every_client_has_cid', 'Every live client has a CID', nocode.map(r => r.label)));

    const unreg = await db.$queryRaw<{ label: string }[]>`
      SELECT DISTINCT p."code" AS label FROM ${orgProjects(organizationId)} p
       WHERE p."code" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "pid_reservation" r WHERE r."organizationId" = ${organizationId} AND r."pid" = p."code")
       ORDER BY 1`;
    out.push(invariant('every_cid_registered', 'Every CID a client carries has a registry row', unreg.map(r => r.label)));

    const incoherent = await db.$queryRaw<{ label: string }[]>`
      WITH op AS ${orgProjects(organizationId)}
      SELECT rs."pid" || ' (' || rs."status" || ')' AS label FROM "pid_reservation" rs
       WHERE rs."organizationId" = ${organizationId} AND (
             (rs."status" = 'ATTACHED' AND NOT EXISTS (SELECT 1 FROM op p WHERE p."code" = rs."pid" AND p."deletedAt" IS NULL))
          OR (rs."status" = 'DELETED' AND (EXISTS (SELECT 1 FROM op p WHERE p."code" = rs."pid" AND p."deletedAt" IS NULL)
                                        OR NOT EXISTS (SELECT 1 FROM op p WHERE p."code" = rs."pid"))))
       ORDER BY 1`;
    out.push(invariant('registry_matches_clients', 'ATTACHED numbers have a live client, DELETED ones only deleted clients', incoherent.map(r => r.label)));

    const unledgered = await db.$queryRaw<{ label: string }[]>`
      SELECT rs."pid" AS label FROM "pid_reservation" rs
       WHERE rs."organizationId" = ${organizationId}
         AND NOT EXISTS (SELECT 1 FROM "cid_event" e WHERE e."organizationId" = rs."organizationId" AND e."cid" = rs."pid")
       ORDER BY 1`;
    out.push(invariant('ledger_complete', 'Every number has at least one CID-ledger event', unledgered.map(r => r.label)));

    const pending = await db.$queryRaw<{ label: string }[]>`
      SELECT COALESCE(p."title", r."projectId") AS label FROM "pid_request" r LEFT JOIN "project" p ON p."id" = r."projectId"
       WHERE r."organizationId" = ${organizationId} AND r."status" = 'PENDING'`;
    out.push(invariant('no_pending_pid_requests', 'No PID request is pending', pending.map(r => r.label)));

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
    ? 'Team Capacity roles: view + manage for the four ladder roles, nothing for any other role'
    : 'Team Capacity roles: every role sees the board; manage only through Super Admin', wrongRoles));

  // … and nothing else hands out what the flow does not.
  const barred = Prisma.join(flow === 'CLIENTS' ? [...CAPACITY_CODES] : [CAPACITY_MANAGE]);
  const exempt = flow === 'CLIENTS' ? Prisma.sql`AND u."id" NOT IN ${ladderUsers(organizationId)}` : Prisma.empty;
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
    ? 'Nobody below the ladder holds a capacity code directly or by an ALLOW override'
    : 'Nobody holds capacity.manage directly or by an ALLOW override', direct.map(r => r.label)));

  return { flow, ok: out.every(i => i.ok), invariants: out };
}

/** JSON-safe copy for a Json column (bigint-free by construction; Dates become strings). */
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
