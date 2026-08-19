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
 * HOW THESE LINES ARE DERIVED (decided 17 Aug 2026: "based on the project managers appointed and
 * the organisation chart you can assume from the seniority level")
 *
 *   1. A LADDER by role seniority is the backbone — stated below, not inferred.
 *   2. A PROJECT MANAGER overrides the ladder for the people on their project, but ONLY when they
 *      actually outrank them. This guard is not theoretical: in the current data a Research
 *      Associate is the manager of one project, and without the check four senior people would
 *      have been made to report to a junior.
 *   3. OVERRIDES win over both. Reality does not always follow a ladder, and this is where a real
 *      line that contradicts the derivation gets recorded.
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
 * Explicit lines, keyed by the person's login email, that override everything above.
 *
 * Two are already needed, because the ladder cannot know about function:
 *   • Product Development is not delivery, so reporting it to the Delivery Manager would be wrong.
 *   • Business Development is not delivery either.
 * Both go to the AVP, who is the nearest person actually accountable for them.
 *
 * ADD REAL LINES HERE. Anything stated here is treated as fact and never recomputed.
 */
const OVERRIDES: Record<string, string> = {
  'ankit.verma@squarkip.com': 'yash@squarkip.com',   // Product Development
  'anant.gupta@squarkip.com': 'yash@squarkip.com',   // Product Development
  'ritik.sharma@squarkip.com': 'yash@squarkip.com',  // Business Development
  'yash@squarkip.com': 'mohit@squarkip.com',         // AVP -> VP
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

  // The most senior holder of a role, so "reports to a Manager" resolves to a person. Ties break
  // on name for stability — re-running must not reshuffle the chart.
  const seniorOf = (role: string): Person | undefined =>
    people.filter(p => p.role === role).sort((a, b) => a.name.localeCompare(b.name))[0];

  // ── Project managers, for signal 2 ────────────────────────────────────────
  const memberships = await prisma.projectMember.findMany({
    where: { isActive: true, project: { deletedAt: null } },
    select: { userId: true, projectRole: true, projectId: true },
  });
  const managerOfProject = new Map<string, string[]>();
  for (const m of memberships) {
    if (m.projectRole === 'MANAGER' || m.projectRole === 'PM') {
      managerOfProject.set(m.projectId, [...(managerOfProject.get(m.projectId) ?? []), m.userId]);
    }
  }
  /** For each person, the most senior project manager they work under who OUTRANKS them. */
  const pmFor = new Map<string, Person>();
  for (const m of memberships) {
    const me = byId.get(m.userId);
    if (!me) continue;
    for (const mgrId of managerOfProject.get(m.projectId) ?? []) {
      const mgr = byId.get(mgrId);
      if (!mgr || mgr.id === me.id) continue;
      if (mgr.rank <= me.rank) continue;               // the guard that matters — see the header
      const held = pmFor.get(me.id);
      if (!held || mgr.rank > held.rank) pmFor.set(me.id, mgr);
    }
  }

  // ── Resolve one manager per person ────────────────────────────────────────
  const resolved = new Map<string, Person | null>();
  for (const p of people) {
    const override = OVERRIDES[p.email];
    if (override) {
      const mgr = byEmail.get(override.toLowerCase());
      resolved.set(p.id, mgr && mgr.id !== p.id ? mgr : null);
      continue;
    }
    const pm = pmFor.get(p.id);
    if (pm) { resolved.set(p.id, pm); continue; }
    let found: Person | null = null;
    for (const role of LADDER[p.role] ?? []) {
      const cand = seniorOf(role);
      if (cand && cand.id !== p.id && cand.rank > p.rank) { found = cand; break; }
    }
    resolved.set(p.id, found);
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
