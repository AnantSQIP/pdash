// Convert an organisation's WORKSPACE FLOW — PROJECTS ⇄ CLIENTS — from the command line.
// The operator's route to the same conversion Settings → Workspace flow runs (docs/WORKSPACE_FLOWS.md).
//
// It runs the SAME code as the API: the conversion lives in @pdash/db (src/workspace-flow-conversion.ts)
// and this script only parses flags and prints. Without --yes it prints the preflight — the conversion
// run as a dry run and rolled back — and changes nothing.
//
// A CONVERSION CHANGES SETTINGS, NOT WORK. Each flow's projects/clients, tasks, time and staffing
// stay exactly where they are; switching hides one flow's work and shows the other's, and switching
// back brings it all straight back (docs/WORKSPACE_FLOWS.md). What does change: the flow itself, who
// holds Team Capacity, and — entering CLIENTS — the time mode, which closes any running clocks.
// Take a backup anyway: it is the way back from a decision you regret, and the conversion asks for
// one before it will run.
//
// Local:
//   DATABASE_URL=... npx ts-node packages/db/prisma/convert-workspace-flow.ts --to CLIENTS
//   DATABASE_URL=... npx ts-node packages/db/prisma/convert-workspace-flow.ts --to CLIENTS \
//       --as mohit@squarkip.com --backup-taken --yes
// Production (inside the api container, after `./scripts/backup.sh`):
//   docker compose -f docker-compose.prod.yml --env-file .env.production \
//     exec -T api node packages/db/prisma/dist/convert-workspace-flow.js --to CLIENTS
//   docker compose -f docker-compose.prod.yml --env-file .env.production \
//     exec -T api node packages/db/prisma/dist/convert-workspace-flow.js --to CLIENTS \
//       --as <super-admin-email> --backup-taken --yes
//
// Flags:
//   --to PROJECTS|CLIENTS   the flow to convert to (required)
//   --org <code>            the organisation, by code (required only when there is more than one)
//   --as <email>            the Super Admin the conversion is recorded against (required with --yes)
//   --backup-taken          you have taken a backup (required with --yes)
//   --note "<text>"         kept with the conversion record
//   --yes                   actually convert
//   --json                  print the report as JSON
//
// The running API caches each organisation's flow for five seconds, so within five seconds of a CLI
// conversion every request sees the new flow. Signed-in browsers should reload.

import { PrismaClient } from '@prisma/client';
import {
  convertWorkspaceFlow, preflightWorkspaceFlow, WorkspaceFlowConversionError,
  type ConversionReport, type WorkspaceFlowName,
} from '@pdash/db';

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

function print(report: ConversionReport, asJson: boolean) {
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }
  const s = report.survey;
  console.log(`\n${report.dryRun ? 'PREFLIGHT (dry run — nothing written)' : 'CONVERTED'}: ${report.organizationName} (${s.organization.code})`);
  console.log(`  ${report.from} → ${report.to}${report.inUse ? '' : '   (not in use yet: nothing to convert)'}`);
  console.log(`  in use: ${s.inUse.projects} projects (${s.inUse.liveProjects} live), ${s.inUse.tasks} tasks, ${s.inUse.timesheets} timesheet entries`);
  const w = s.work;
  for (const f of ['PROJECTS', 'CLIENTS'] as const) {
    console.log(`  ${f.padEnd(8)} work: ${w.liveProjects[f]} live of ${w.projects[f]}, ${w.tasks[f]} tasks, ${w.timesheets[f]} timesheet entries, ${w.staffing[f]} staffing rows`);
  }
  console.log(`  shared:   ${w.shared.tasks} tasks and ${w.shared.timesheets} timesheet entries belong to no matter at all`);
  console.log(`  registry: ${Object.entries(w.registryByStatus).map(([k, v]) => `${k} ${v}`).join(', ') || 'empty'}`);
  console.log('\n  steps:');
  for (const step of report.steps) {
    console.log(`   ${String(step.changed).padStart(5)}  ${step.label}`);
    const d = step.details ?? {};
    for (const key of ['rolesGranted', 'rolesRevoked', 'groupsRevoked', 'directGrantsRevoked', 'allowOverridesRevoked']) {
      const list = d[key];
      if (Array.isArray(list) && list.length) console.log(`          ${key}: ${list.slice(0, 12).join(' · ')}${list.length > 12 ? ` · …(+${list.length - 12})` : ''}`);
    }
  }
  console.log(`\n  verification (${report.verification.flow}): ${report.verification.ok ? 'PASSES' : 'FAILS'}`);
  for (const inv of report.verification.invariants) {
    console.log(`   ${inv.ok ? 'ok  ' : 'FAIL'} ${inv.label}${inv.ok ? '' : ` — ${inv.found} found: ${(inv.examples ?? []).join(' · ')}`}`);
  }
  if (report.blockers.length) {
    console.log('\n  BLOCKED:');
    for (const b of report.blockers) console.log(`   · ${b.message}${b.examples?.length ? ` (${b.examples.join(', ')})` : ''}`);
  }
  if (report.changeId) console.log(`\n  recorded as workspace_flow_change ${report.changeId} at ${report.changedAt}`);
}

async function main() {
  const to = (flag('--to') ?? '').toUpperCase() as WorkspaceFlowName;
  if (to !== 'PROJECTS' && to !== 'CLIENTS') {
    console.error('--to PROJECTS|CLIENTS is required.');
    process.exit(2);
  }
  const asJson = has('--json');
  const orgCode = flag('--org');
  const orgs = await prisma.organization.findMany({
    where: orgCode ? { code: orgCode } : {}, select: { id: true, name: true, code: true },
  });
  if (!orgs.length) { console.error(orgCode ? `No organisation with code "${orgCode}".` : 'No organisation.'); process.exit(2); }
  if (orgs.length > 1) {
    console.error(`There are ${orgs.length} organisations — name one with --org <code>: ${orgs.map(o => o.code).join(', ')}`);
    process.exit(2);
  }
  const org = orgs[0];

  if (!has('--yes')) {
    const report = await preflightWorkspaceFlow(prisma, { organizationId: org.id, to, actorId: 'cli-preflight' });
    print(report, asJson);
    if (!asJson) {
      console.log(report.blockers.length
        ? '\nNot converting: resolve the blockers above first.'
        : `\nNo work is rewritten: the ${report.from} flow's matters stay as they are, out of sight, and are`
          + `\nthere again unchanged if the flow is switched back.`
          + `\nTo convert: take a backup (./scripts/backup.sh), then re-run with --as <super-admin-email> --backup-taken --yes`);
    }
    process.exit(report.blockers.length ? 1 : 0);
  }

  if (!has('--backup-taken')) {
    console.error('Refusing: take a backup first (./scripts/backup.sh on the server), then pass --backup-taken.');
    process.exit(2);
  }
  const email = flag('--as');
  if (!email) { console.error('Refusing: --as <email> of a Super Admin of this organisation is required with --yes.'); process.exit(2); }
  const actor = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' }, organizationId: org.id, deletedAt: null,
      userRoles: { some: { role: { name: 'Super Admin', organizationId: org.id } } },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!actor) { console.error(`Refusing: ${email} is not a Super Admin of ${org.name}.`); process.exit(2); }

  try {
    const report = await convertWorkspaceFlow(prisma, {
      organizationId: org.id, to, actorId: actor.id, note: flag('--note') ?? 'Converted from the command line',
      auditInTx: async (tx, r) => {
        await tx.auditLog.create({
          data: {
            userId: actor.id, organizationId: org.id, entityType: 'ORGANIZATION', entityId: org.id,
            action: 'org.workspace_flow_changed',
            oldValue: { workspaceFlow: r.from }, newValue: { workspaceFlow: r.to },
            metadata: { changeId: r.changeId, source: 'cli', steps: r.steps.map(s => ({ key: s.key, changed: s.changed })) },
          },
        });
      },
    });
    print(report, asJson);
    if (!asJson) console.log('\nDone. Everyone signed in should reload the app — its whole shape follows the flow.'
      + `\nThe ${report.from} flow's work is untouched and hidden; convert back to see it again.`);
  } catch (e) {
    if (e instanceof WorkspaceFlowConversionError) {
      if (e.report) print({ ...e.report, blockers: e.blockers ?? e.report.blockers }, asJson);
      console.error(`\nNOT CONVERTED (${e.code}): ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
