/**
 * Every destructive action the API offers has a way to reach it from the interface.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/reachable-actions.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY THIS EXISTS
 *
 * The permanent-delete work shipped with its second half missing and nothing said so. The server
 * refused to destroy a project unless it was already deleted, the Deleted Data screen listed
 * projects that were already deleted — and no screen in the app could delete one. Every piece
 * typechecked, every test passed, the API method existed in the client, and the feature was
 * unreachable. It was found by the owner asking how to use it.
 *
 * A method defined in lib/api.ts and called by nothing is the signature of that mistake. It is
 * not always a bug — an endpoint can legitimately be exercised only by scripts — so the list
 * below is a list of DECISIONS: an action either has a caller, or it is named here with the
 * reason it does not.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const WEB = join(__dirname, '..', 'apps', 'web');

let passed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { passed++; return; }
  failures.push(name + (detail ? `\n     ${detail}` : ''));
};

/** Every .ts/.tsx file under apps/web EXCEPT the api client itself, which is where they are declared. */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { sources(full, out); continue; }
    if (!['.ts', '.tsx'].includes(extname(entry))) continue;
    if (full.endsWith(join('lib', 'api.ts'))) continue;
    out.push(full);
  }
  return out;
}

const app = sources(WEB).map(f => readFileSync(f, 'utf8')).join('\n');

/**
 * The destructive actions, and where each is reached from.
 *
 * Adding a row here is the point: it forces the question "and where does somebody click this?"
 * at the moment the endpoint is written, rather than months later when they ask.
 */
const DESTRUCTIVE: { call: string; what: string }[] = [
  { call: 'projects.delete(', what: 'delete a project (project page header)' },
  { call: 'projects.deletePermanent(', what: 'destroy a project (Administration → Deleted Data)' },
  { call: 'tasks.delete(', what: 'delete a task (task detail panel)' },
  { call: 'tasks.deletePermanent(', what: 'destroy a task (Administration → Deleted Data)' },
  { call: 'adminData.restoreProject(', what: 'restore a project (Administration → Deleted Data)' },
  { call: 'adminData.restoreTask(', what: 'restore a task (Administration → Deleted Data)' },
];

/**
 * Declared but deliberately not reachable from the interface, with the reason.
 *
 * The bar is "a person should never do this from a screen", not "we have not built it yet".
 */
const SCRIPT_ONLY: Record<string, string> = {};

for (const { call, what } of DESTRUCTIVE) {
  const reachable = app.includes(call);
  const excused = call in SCRIPT_ONLY;
  check(
    `${what} is reachable from the interface`,
    reachable || excused,
    `nothing outside lib/api.ts calls \`${call.replace('(', '')}\`.\n`
    + `     The endpoint exists and the client method exists, so this looks finished and is not.\n`
    + `     Either give it a control in the app, or add it to SCRIPT_ONLY with the reason.`,
  );
}

// The reverse: an excuse left behind after somebody DID build the control is stale, and a stale
// excuse is how the next gap hides.
for (const [call, reason] of Object.entries(SCRIPT_ONLY)) {
  check(`${call} excuse is still true`, !app.includes(call),
    `SCRIPT_ONLY says "${reason}", but something in the app calls it now — remove the entry`);
}

// Deleting a project is the one that was missing, so it is pinned by name rather than only by the
// loop above: the control must live on the project page, not somewhere incidental.
const projectPage = readFileSync(join(WEB, 'app', 'projects', '[id]', 'ProjectDetailClient.tsx'), 'utf8');
check('the project page is where a project is deleted from', projectPage.includes('projects.delete('),
  'the delete control has left the project page');
check('and it is gated on project.delete, not shown to everyone',
  projectPage.includes("can('project.delete')"),
  'the button must be behind the permission, or everyone sees a control they cannot use');
check('and it asks before doing it', /confirmDialog\(\{[^}]*danger: true/s.test(projectPage),
  'a destructive action needs a confirmation marked danger');

console.log(`\n${failures.length ? '✗' : '✓'} reachable actions: ${passed} passed, ${failures.length} failed`
  + ` — ${DESTRUCTIVE.length} destructive actions checked\n`);
failures.forEach(f => console.error('  ✗ ' + f + '\n'));
process.exit(failures.length ? 1 : 0);
