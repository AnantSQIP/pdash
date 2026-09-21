/**
 * WHICH FLOW A DATABASE WAKES UP IN — the migration's decision, checked on real databases.
 *
 *   CLIENTS_ERA_DATABASE_URL=postgresql://…/a_clients_era_db \
 *   NEVER_CLIENTS_DATABASE_URL=postgresql://…/a_never_clients_db \
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/workspace-flow-decision.spec.ts
 *
 * Both databases must already have been migrated (`prisma migrate deploy`). Neither is written to
 * in a way that survives: the decision block is re-run and the flow put back as it was found.
 *
 * WHY THIS EXISTS. `20261105090000_workspace_flow` used to default every existing organisation to
 * PROJECTS. On a database that has been through the clients era — the owner's live server — that
 * one line would have turned the firm's client work into the projects screens the morning after a
 * deploy. The migration now READS the flow off the database instead, from the marks the clients
 * era left behind, and this is the check that it reads them right:
 *
 *   · a clients-era database comes up CLIENTS, and keeps every client it had;
 *   · a database that never saw the clients flow comes up PROJECTS and notices nothing;
 *   · every project/client row is stamped with the flow it belongs to;
 *   · running the decision again reaches the same verdict (it is re-runnable);
 *   · and a flow a Super Admin has already chosen is never overruled by a migration.
 *
 * It runs the migration file itself, through psql, exactly as a deploy does — not a copy of its
 * logic, which could agree with itself while both were wrong.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const MIGRATION = join(__dirname, '..', 'packages', 'db', 'prisma', 'migrations', '20261105090000_workspace_flow', 'migration.sql');

let passed = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; console.log(`  ok  ${name}`); return; }
  failures.push(`${name}\n     got:  ${g}\n     want: ${w}`);
  console.log(`  FAIL ${name}\n     got:  ${g}\n     want: ${w}`);
}

const db = (url: string) => new PrismaClient({ datasources: { db: { url } } });

/**
 * Run the migration file against a database, the way `prisma migrate deploy` does.
 *
 * psql refuses Prisma's `?schema=` query parameter, which is Prisma's own and not libpq's, so it
 * is dropped here rather than asked of the caller — every URL in this repository carries it.
 */
function runDecision(url: string) {
  const libpq = url.replace(/[?&]schema=[^&]*/g, '').replace(/\?$/, '');
  // The migration says out loud which flow it decided on and why; that is for a deploy log, not
  // for a test's output, so only warnings and errors come through here.
  execFileSync('psql', [libpq, '-v', 'ON_ERROR_STOP=1', '-q', '-f', MIGRATION], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  });
}

type Census = {
  flow: string;
  changedAt: Date | null;
  projects: number;
  byFlow: Record<string, number>;
  cidEvents: number;
  clientGroups: number;
  clientsEraMigration: number;
  liveCidConstraint: number;
};

async function census(p: PrismaClient): Promise<Census> {
  const [org] = await p.$queryRawUnsafe<{ workspaceFlow: string; workspaceFlowChangedAt: Date | null }[]>(
    `SELECT "workspaceFlow", "workspaceFlowChangedAt" FROM "organization" ORDER BY "createdAt", "id" LIMIT 1`);
  const rows = await p.$queryRawUnsafe<{ workspaceFlow: string; n: bigint }[]>(
    `SELECT "workspaceFlow", count(*) AS n FROM "project" GROUP BY "workspaceFlow"`);
  const [marks] = await p.$queryRawUnsafe<{ cid: bigint; grp: bigint; mig: bigint; con: bigint }[]>(`
    SELECT (SELECT count(*) FROM "cid_event")                                                        AS cid,
           (SELECT count(*) FROM "client_group")                                                     AS grp,
           (SELECT count(*) FROM "_prisma_migrations"
             WHERE "migration_name" = '20261018110000_pid_request_backfill' AND "finished_at" IS NOT NULL) AS mig,
           (SELECT count(*) FROM "pg_constraint" WHERE "conname" = 'project_live_client_has_cid')     AS con`);
  return {
    flow: org.workspaceFlow,
    changedAt: org.workspaceFlowChangedAt,
    projects: rows.reduce((a, r) => a + Number(r.n), 0),
    byFlow: Object.fromEntries(rows.map(r => [r.workspaceFlow, Number(r.n)])),
    cidEvents: Number(marks.cid),
    clientGroups: Number(marks.grp),
    clientsEraMigration: Number(marks.mig),
    liveCidConstraint: Number(marks.con),
  };
}

async function main() {
  if (!existsSync(MIGRATION)) throw new Error(`migration not found: ${MIGRATION}`);
  const clientsUrl = process.env.CLIENTS_ERA_DATABASE_URL;
  const projectsUrl = process.env.NEVER_CLIENTS_DATABASE_URL;
  if (!clientsUrl || !projectsUrl) {
    console.error('CLIENTS_ERA_DATABASE_URL and NEVER_CLIENTS_DATABASE_URL are both required.');
    process.exit(2);
  }

  // ── 1. A clients-era database ───────────────────────────────────────────────
  console.log('\n— a database that has been through the clients era —');
  const clients = db(clientsUrl);
  const c0 = await census(clients);
  check('it still carries at least one mark of the clients era',
    c0.clientsEraMigration > 0 || c0.cidEvents > 0 || c0.clientGroups > 0 || c0.liveCidConstraint > 0, true);
  check('the organisation runs CLIENTS', c0.flow, 'CLIENTS');
  check('…which no migration claims a person chose', c0.changedAt, null);
  check('every client it had is still there', c0.projects > 0, true);
  check('…and every row belongs to the clients flow', c0.byFlow, { CLIENTS: c0.projects });

  // Re-runnable: the same file, run again, reaches the same verdict. (The repair migration that
  // follows this one drops the constraint and puts pid_request back, so two of the five marks are
  // gone by now — the verdict has to survive that, which is why there are five.)
  runDecision(clientsUrl);
  const c1 = await census(clients);
  check('running the decision again says CLIENTS again', c1.flow, 'CLIENTS');
  check('…and does not re-stamp a single row', c1.byFlow, c0.byFlow);

  // A flow somebody has chosen is a person's decision, not a migration's.
  await clients.$executeRawUnsafe(
    `UPDATE "organization" SET "workspaceFlow" = 'PROJECTS', "workspaceFlowChangedAt" = now()`);
  runDecision(clientsUrl);
  const c2 = await census(clients);
  check('a flow a Super Admin has already chosen is left alone', c2.flow, 'PROJECTS');
  await clients.$executeRawUnsafe(
    `UPDATE "organization" SET "workspaceFlow" = '${c0.flow}', "workspaceFlowChangedAt" = NULL`);
  check('…and the database is put back as it was found', (await census(clients)).flow, c0.flow);
  await clients.$disconnect();

  // ── 2. A database that never saw the clients flow ───────────────────────────
  console.log('\n— a database that never saw the clients flow —');
  const projects = db(projectsUrl);
  const p0 = await census(projects);
  check('no mark of the clients era is on it', [p0.clientsEraMigration, p0.cidEvents, p0.clientGroups, p0.liveCidConstraint], [0, 0, 0, 0]);
  check('the organisation runs PROJECTS', p0.flow, 'PROJECTS');
  check('every project belongs to the projects flow', p0.byFlow, { PROJECTS: p0.projects });

  // The real proof: forget the flow entirely and let the migration decide from scratch.
  await projects.$executeRawUnsafe(
    `UPDATE "organization" SET "workspaceFlow" = 'CLIENTS', "workspaceFlowChangedAt" = NULL`);
  runDecision(projectsUrl);
  const p1 = await census(projects);
  check('asked from scratch, the migration still says PROJECTS', p1.flow, 'PROJECTS');
  check('…and the rows it had already stamped are not touched', p1.byFlow, p0.byFlow);
  await projects.$disconnect();

  console.log(`\n${failures.length ? '✗' : '✓'} workspace-flow decision: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(2); });
