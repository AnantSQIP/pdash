/**
 * Every database script is either shipped to production or deliberately not — packages/db/tsconfig.seed.json.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' tools/db-scripts-compiled.spec.ts
 *
 * Plain assertions, no framework — this repo has none.
 *
 * WHY THIS EXISTS
 *
 * The production container has no ts-node. It runs these scripts as plain JavaScript out of
 * `packages/db/prisma/dist`, and that directory is filled by ONE tsconfig whose `include` is a
 * hand-written list of filenames. Add a script and forget the list, and everything looks correct:
 * it typechecks, it runs locally, it is committed, it is on the server — and then
 *
 *     Error: Cannot find module '/app/packages/db/prisma/dist/<the script>.js'
 *
 * at the moment somebody needs it, which is invariably during a deploy. That happened with
 * demo-access-2026-09.ts on 11 Sep 2026.
 *
 * So the list is no longer allowed to be silently incomplete. Every .ts file beside the seed must
 * be named in one of two places: the tsconfig (shipped), or LOCAL_ONLY below (never shipped, with
 * the reason written down). A new file in neither fails this test by name.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DB = join(__dirname, '..', 'packages', 'db');

/**
 * Scripts that are deliberately NOT compiled into the image, and why.
 *
 * The bar for this list is "running it on production would be a mistake", not "we have not got
 * round to it". A one-off migration that has already been applied, or a demo-data seeder, belongs
 * here; anything an operator might legitimately need on the server does not.
 */
const LOCAL_ONLY: Record<string, string> = {
  'backfill-all.ts': 'one-off backfill, already applied everywhere',
  'backfill-progress.ts': 'one-off backfill, already applied everywhere',
  'normalize-progress.ts': 'one-off normalisation, already applied everywhere',
  'roster-fix-2026-07.ts': 'superseded by roster-align-2026-08.ts, which IS shipped',
  'seed-patents-demo.ts': 'demo data — the one thing that must never run on production',
};

let passed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { passed++; return; }
  failures.push(name + (detail ? `\n     ${detail}` : ''));
};

// The tsconfig carries "//"-prefixed comment keys, which are legal for TypeScript and illegal for
// JSON.parse. Strip whole-line comment entries before parsing rather than pulling in a JSON5 dep.
const raw = readFileSync(join(DB, 'tsconfig.seed.json'), 'utf8').replace(/^\s*"\/\/[^"]*":.*$/gm, '');
const include: string[] = JSON.parse(raw).include;
const compiled = new Set(include.map(p => p.replace(/^prisma\//, '')));
const onDisk = readdirSync(join(DB, 'prisma')).filter(f => f.endsWith('.ts')).sort();

check('there are database scripts to check at all', onDisk.length > 0, `found ${onDisk.length}`);

for (const file of onDisk) {
  const isCompiled = compiled.has(file);
  const isLocal = file in LOCAL_ONLY;
  check(
    `${file} is classified`,
    isCompiled !== isLocal,
    isCompiled && isLocal
      ? 'it is BOTH compiled and listed as local-only — pick one'
      : `it is in neither packages/db/tsconfig.seed.json nor LOCAL_ONLY in this spec.\n`
        + `     If the server needs it, add "prisma/${file}" to the tsconfig include list.\n`
        + `     If it must never run on production, add it to LOCAL_ONLY with the reason.`,
  );
}

// The reverse direction: a tsconfig entry naming a file that no longer exists fails the whole
// compile with TS6053, so the image stops building — loud, but only at deploy time.
for (const file of compiled) {
  check(`${file} named in the tsconfig still exists`, onDisk.includes(file),
    `packages/db/tsconfig.seed.json includes "prisma/${file}", which is not on disk`);
}

for (const file of Object.keys(LOCAL_ONLY)) {
  check(`${file} marked local-only still exists`, onDisk.includes(file),
    'LOCAL_ONLY names a file that has been deleted — remove the entry');
  check(`${file} says WHY it is local-only`, LOCAL_ONLY[file].trim().length > 10,
    'give a real reason; "not needed" tells the next person nothing');
}

// The two scripts a deploy actually depends on. Named explicitly because losing either is the
// difference between a deploy that works and one that strands half a migration.
for (const essential of ['seed.ts', 'regrant-roles.ts', 'reset-operational-data.ts', 'set-passcode.ts']) {
  check(`${essential} ships — a deploy runs it`, compiled.has(essential));
}

console.log(`\n${failures.length ? '✗' : '✓'} database scripts: ${passed} passed, ${failures.length} failed`
  + ` — ${compiled.size} compiled for production, ${Object.keys(LOCAL_ONLY).length} local-only\n`);
failures.forEach(f => console.error('  ✗ ' + f + '\n'));
process.exit(failures.length ? 1 : 0);
