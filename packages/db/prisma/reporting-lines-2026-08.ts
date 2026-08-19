import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Reporting lines — who each person's manager is.
 *
 * `user_manager` has been EMPTY since the system was built, which is why the appraisal module has
 * never worked: it sets each appraisal's reviewerId from this table when a cycle launches, so every
 * appraisal launched with no reviewer and the manager-review step could not run at all. The org
 * chart has been drawing nothing for the same reason.
 *
 * HOW THESE LINES ARE DERIVED
 *
 *   1. OVERRIDES first — the lines somebody has actually decided. These are facts, not guesses.
 *   2. Otherwise a LADDER by role seniority, with reports DISTRIBUTED evenly across the managers
 *      available at the tier above.
 *
 * THE PROJECT-MANAGER SIGNAL WAS REMOVED (19 Aug 2026), having been tried and found wrong.
 *
 * The original brief was to derive lines "based on the project managers appointed". On the real
 * roster that produced a Consultant and an intern both reporting directly to the VP, because both
 * happened to be staffed on projects the VP manages — while their peers reported to the Delivery
 * Manager. The rule did what it was told; the trouble is the premise.
 *
 * Managing a PROJECT and managing a PERSON are different relationships. One is temporary and can
 * be held by several people at once — somebody on three matters has three project managers — while
 * a reporting line is singular and lasting. Deriving the second from the first produces a chart
 * that reshuffles itself every time staffing changes, which is the opposite of what an org chart
 * is for.
 *
 * WHY DISTRIBUTE RATHER THAN PICK THE SENIOR-MOST PERSON
 *
 * The first version sent everyone at a level to the single most senior person above them, which
 * gave one Senior Research Associate seven direct reports while three of her peers had none. That
 * is an artefact of "pick the first candidate", not an org design. Reports are now dealt out in
 * rotation, so spans of control come out even.
 *
 * The TIER each person reports into is derived and reliable. WHICH individual within that tier is
 * a real management decision this script cannot know — it is deterministic and even, and where it
 * is wrong, the fix is one line in OVERRIDES.
 *
 * Re-runnable and idempotent: it computes the whole map, prints it, and writes only what changed.
 */

// ── Seniority. Higher number = more senior. Roles, not job titles: a designation containing
//    "Senior" grants nothing, which is the same rule roster-align-2026-08.ts follows.
const RANK: Record<string, number> = {
  'Super Admin': 100,
  Admin: 90,
  Manager: 70,
  HR: 60,
  'Senior Consultant': 50,
  Consultant: 40,
  'Senior Research Associate': 30,
  Employee: 10,
};

/**
 * Who a role reports to, by default, expressed as the role of the manager. First match wins, so
 * the fallbacks read top-to-bottom.
 */
const LADDER: Record<string, string[]> = {
  Admin: ['Super Admin'],
  Manager: ['Super Admin'],
  // People-ops reports to the top rather than through delivery.
  HR: ['Super Admin'],
  'Senior Consultant': ['Manager', 'Super Admin'],
  Consultant: ['Manager', 'Super Admin'],
  'Senior Research Associate': ['Consultant', 'Manager', 'Super Admin'],
  Employee: ['Senior Research Associate', 'Consultant', 'Manager', 'Super Admin'],
};

/**
 * Explicit lines, keyed by login email, that override the ladder.
 *
 * These are the lines somebody has DECIDED, as opposed to the ones this script infers. Function is
 * the usual reason one is needed: Product Development and Business Development are not delivery,
 * so the Delivery Manager is the wrong line for them however senior he is.
 *
 * ADD REAL LINES HERE. Anything stated here is treated as fact and never recomputed.
 */
const OVERRIDES: Record<string, string> = {
  'yash@squarkip.com': 'mohit@squarkip.com',         // AVP -> VP
  // Product Development, stated 19 Aug 2026. The two sit on the same team and report to
  // different people, which no ladder would ever guess — exactly what this map is for.
  'ankit.verma@squarkip.com': 'mohit@squarkip.com',
  'anant.gupta@squarkip.com': 'yash@squarkip.com',
  // Business Development reports to the AVP: it is not delivery, so the Delivery Manager is the
  // wrong line for it.
  'ritik.sharma@squarkip.com': 'yash@squarkip.com',
};

/**
 * People who should have no manager, and never be one.
 *
 * hr@squarkip.com is a SHARED account — already recorded as Phase 1 debt because it approves
 * leave and reads personal details with no attribution. Making it somebody's manager would put
 * appraisal remarks behind a login several people use.
 */
const EXCLUDE = new Set(['hr@squarkip.com']);

type Person = { id: string; email: string; name: string; role: string; rank: number };

async function main() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      userRoles: { select: { role: { select: { name: true } } }, take: 1 },
    },
  });

  const people: Person[] = users
    .filter(u => !EXCLUDE.has(u.email.toLowerCase()))
    .map(u => {
      const role = u.userRoles[0]?.role.name ?? 'Employee';
      return {
        id: u.id, email: u.email.toLowerCase(),
        name: `${u.firstName} ${u.lastName}`.trim(),
        role, rank: RANK[role] ?? 0,
      };
    });
  const byEmail = new Map(people.map(p => [p.email, p]));
  const byId = new Map(people.map(p => [p.id, p]));

  /** Everyone holding a role, in a stable order — re-running must not reshuffle the chart. */
  const holdersOf = (role: string): Person[] =>
    people.filter(p => p.role === role).sort((a, b) => a.name.localeCompare(b.name));

  // ── Resolve one manager per person ────────────────────────────────────────
  const resolved = new Map<string, Person | null>();

  // 1. Stated lines win outright.
  const pending: Person[] = [];
  for (const p of people) {
    const override = OVERRIDES[p.email];
    if (override) {
      const mgr = byEmail.get(override.toLowerCase());
      resolved.set(p.id, mgr && mgr.id !== p.id ? mgr : null);
    } else {
      pending.push(p);
    }
  }

  // 2. Everyone else follows the ladder, DEALT OUT IN ROTATION across the tier above.
  //
  //    Grouped by role and handled most-senior-first, so a tier's managers are settled before the
  //    tier below is distributed among them. Within a role, people are taken in name order and
  //    assigned round-robin — deterministic, so the chart is identical on every run, and even, so
  //    nobody inherits seven reports while their peers have none.
  const roleOrder = [...new Set(pending.map(p => p.role))].sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0));
  for (const role of roleOrder) {
    const group = pending.filter(p => p.role === role).sort((a, b) => a.name.localeCompare(b.name));
    // The first tier in the ladder that actually has anybody senior enough in it.
    let candidates: Person[] = [];
    for (const mgrRole of LADDER[role] ?? []) {
      candidates = holdersOf(mgrRole).filter(c => c.rank > (RANK[role] ?? 0));
      if (candidates.length) break;
    }
    group.forEach((p, i) => {
      const mgr = candidates.length ? candidates[i % candidates.length] : null;
      resolved.set(p.id, mgr && mgr.id !== p.id ? mgr : null);
    });
  }

  // ── Guard: no cycles. A loop here would make the appraisal chain unresolvable. ─────────
  for (const p of people) {
    const seen = new Set<string>([p.id]);
    let cur = resolved.get(p.id) ?? null;
    while (cur) {
      if (seen.has(cur.id)) {
        console.error(`CYCLE via ${p.name} -> ${cur.name}. Refusing to write; fix OVERRIDES.`);
        process.exit(1);
      }
      seen.add(cur.id);
      cur = resolved.get(cur.id) ?? null;
    }
  }

  // ── Write only what changed ───────────────────────────────────────────────
  const existing = await prisma.userManager.findMany({ select: { id: true, userId: true, managerId: true } });
  const currentOf = new Map(existing.map(e => [e.userId, e]));
  let added = 0, changed = 0, cleared = 0;

  for (const p of [...people].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))) {
    const mgr = resolved.get(p.id) ?? null;
    const now = currentOf.get(p.id);
    const label = `${p.name} (${p.role})`.padEnd(46);
    if (!mgr) {
      if (now) { await prisma.userManager.delete({ where: { id: now.id } }); cleared++; console.log(`  CLEAR ${label} -> (none)`); }
      else console.log(`  ROOT  ${label} -> (no manager — top of the chart)`);
      continue;
    }
    if (!now) {
      await prisma.userManager.create({ data: { userId: p.id, managerId: mgr.id } });
      added++; console.log(`  ADD   ${label} -> ${mgr.name}`);
    } else if (now.managerId !== mgr.id) {
      await prisma.userManager.update({ where: { id: now.id }, data: { managerId: mgr.id } });
      changed++; console.log(`  MOVE  ${label} -> ${mgr.name}`);
    } else {
      console.log(`  keep  ${label} -> ${mgr.name}`);
    }
  }

  console.log(`\n${added} added, ${changed} moved, ${cleared} cleared. ${people.length} people.`);
  console.log('Appraisal cycles read this table when they launch — relaunch a cycle to pick up changes.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
