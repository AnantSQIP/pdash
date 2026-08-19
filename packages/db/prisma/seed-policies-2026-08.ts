import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Starter policies for the Company → Policies library.
 *
 * WHY THIS EXISTS
 *
 * The policy library was built, works, and had nothing in it. From the outside that is
 * indistinguishable from a broken feature — which is exactly what happened: it was reported as
 * done, and the user's answer was "where are the policies, I haven't provided you anything and I
 * can't see anything on the dashboard either".
 *
 * WHAT THESE ARE, AND WHAT THEY ARE NOT
 *
 * Each entry below DESCRIBES A RULE THE SYSTEM ALREADY ENFORCES IN CODE. Nothing here is invented
 * HR policy. The numbers are read from the implementation, and the source is cited in each body so
 * anybody can check it:
 *
 *   • half day under 4 hours          → HALF_DAY_HOURS   (attendance.module.ts)
 *   • timesheet backfill 31 / 92 days → SELF_FILL_DAYS, APPROVAL_MAX_DAYS (timesheets.service.ts)
 *   • 12 CL / 8 SL / 15 EL            → LeaveType.annualQuota (seed.ts)
 *   • 2 optional holidays a year      → the published Squark IP 2026 calendar
 *   • WFH approved by attendance.manage holders — HR, Admin, Super Admin
 *
 * That distinction matters. A staff handbook is HR's to write and the firm's to sign off. What the
 * software does is a fact, and staff being unable to read that fact anywhere is the actual gap
 * these fill. Every one is marked for HR review in its description, and each is editable and
 * deletable in the UI like any other policy.
 *
 * requiresAck is FALSE on all of them. Acknowledgement is a record that somebody accepted a term of
 * employment; asking 27 people to sign a description of software behaviour before HR has read it
 * would make that record mean less, not more. HR can turn it on per policy once they have.
 *
 * Idempotent: matches on title, updates in place, never duplicates. Safe to re-run.
 */

const CITATION =
  'Auto-drafted from the rule the Dashboard enforces today — HR to review, edit and sign off. ' +
  'It is not a substitute for the firm\'s signed handbook.';

type Draft = { title: string; category: string; description: string; body: string };

const POLICIES: Draft[] = [
  {
    title: 'Attendance and punching in',
    category: 'Attendance',
    description: CITATION,
    body: [
      'HOW THE DAY IS RECORDED',
      '',
      'Attendance is recorded by punching in and out. When you open the Dashboard for the first time',
      'on a working day and have not yet punched in, a prompt appears offering three choices: Punch',
      'In, Punch In — Working from home, or Punch in later. Dismissing it hides it for the rest of',
      'that day on that device; it does not mark you absent, and the Punch In button stays available',
      'beside the clock on the Home page.',
      '',
      'Your location is captured at the moment you punch, and again when you punch out.',
      '',
      'HALF DAYS',
      '',
      'A day on which fewer than 4 hours are recorded between punch-in and punch-out is a HALF DAY,',
      'not a full present day. This is applied automatically — there is nothing to request.',
      '',
      'IF YOU FORGET TO PUNCH OUT',
      '',
      'An open punch is closed automatically at the end of the IST calendar day. If the recorded',
      'time is wrong, raise a regularisation request from the Attendance page; HR reviews it.',
      '',
      'IF YOU FORGET TO PUNCH IN',
      '',
      'Raise a regularisation request for that date. Approval sits with HR, not with your manager.',
    ].join('\n'),
  },
  {
    title: 'Working from home',
    category: 'Attendance',
    description: CITATION,
    body: [
      'TWO WAYS A DAY BECOMES A WORK-FROM-HOME DAY',
      '',
      '1. AGREED IN ADVANCE. Raise a work-from-home request from the Leaves section. It is reviewed',
      '   by HR or an administrator. Once approved, the days it covers are recorded as WFH',
      '   automatically when you punch in — you do not need to choose anything.',
      '',
      '2. ON THE DAY. The first-login prompt offers "Punch In — Working from home". This is the only',
      '   place in the Dashboard where work-from-home can be chosen on the day, deliberately: it',
      '   belongs to the once-a-day moment of starting work, whereas a permanent button beside the',
      '   clock invites a mis-click on a day nobody meant to change.',
      '',
      'An approved request always wins. If you have one covering today, the day is WFH regardless of',
      'which button you press.',
      '',
      'WHAT IT IS NOT',
      '',
      'Working from home is a place of work, not a leave type. It does not consume any leave balance,',
      'and it counts as a full working day.',
    ].join('\n'),
  },
  {
    title: 'Leave: entitlement and how to apply',
    category: 'Leave',
    description: CITATION + ' Quotas are read from the Dashboard\'s leave-type configuration.',
    body: [
      'ANNUAL ENTITLEMENT, AS CONFIGURED IN THE DASHBOARD',
      '',
      '  Casual Leave (CL)   12 days',
      '  Sick Leave (SL)      8 days',
      '  Earned Leave (EL)   15 days',
      '',
      'Your live balance is shown on the Leaves page and on the Home page. The balance shown is',
      'authoritative — it is computed from approved leave, not from a stored figure.',
      '',
      'HALF DAYS',
      '',
      'Leave can be taken in half-day steps.',
      '',
      'HOW TO APPLY',
      '',
      'Apply from the Leaves page. Requests go to HR. You will be notified when the request is',
      'decided, and an approved request appears on the team calendar and on the capacity board, so',
      'whoever is planning work can see it.',
      '',
      'PLANNING NOTE',
      '',
      'Approved leave reduces your available hours on the capacity board. Work already assigned to',
      'you across those days does not reassign itself — tell your reporting manager so cover can be',
      'arranged.',
    ].join('\n'),
  },
  {
    title: 'Holidays, including optional holidays',
    category: 'Leave',
    description:
      'The 2026 holiday list is the published Squark IP calendar. The two-optional-holiday allowance ' +
      'is stated on that calendar. HR to review before circulating.',
    body: [
      'GAZETTED HOLIDAYS',
      '',
      'The firm is closed. Nothing is required of you and no leave is consumed. Gazetted holidays are',
      'shown on the Calendar page and are excluded from your available hours automatically.',
      '',
      'OPTIONAL HOLIDAYS',
      '',
      'The published calendar offers six optional holidays, of which each employee may avail TWO in a',
      'calendar year. Elect the two you want from the Calendar page. An elected day becomes a day off',
      'for you alone — the firm stays open and colleagues who did not elect it are working.',
      '',
      'The limit of two is enforced. Elections run on the calendar year, January to December.',
      '',
      'WORKING ON A HOLIDAY',
      '',
      'If you work on a holiday or a weekend, claim compensatory off — see the comp-off policy. Time',
      'worked on a closed day is not counted automatically; the claim is what records it.',
    ].join('\n'),
  },
  {
    title: 'Compensatory off',
    category: 'Leave',
    description: CITATION,
    body: [
      'WHEN A COMP-OFF ARISES',
      '',
      'When you work on a weekend or a holiday. Open the Attendance calendar, click the day you',
      'worked, and raise a comp-off claim for it.',
      '',
      'APPROVAL',
      '',
      'HR reviews the claim and may ask for evidence of the work done. On approval a comp-off credit',
      'is added to your balance, which you then apply for like any other leave.',
      '',
      'A comp-off is credited for the day worked, in the same half-day or full-day shape as the work',
      'itself. It is not an automatic entitlement — an unclaimed day worked leaves no credit behind,',
      'so claim it while you remember.',
    ].join('\n'),
  },
  {
    title: 'Timesheets and the backfill window',
    category: 'Timesheets',
    description: CITATION + ' The 31-day and 92-day boundaries are the values enforced in code.',
    body: [
      'WHAT TO LOG',
      '',
      'Log time against the task you worked on, on the day you worked it. Time carries the project\'s',
      'billability, so a mis-posted entry affects what a client can be shown.',
      '',
      'HOW FAR BACK YOU CAN FILL',
      '',
      '  Up to 31 days old       Fill it yourself, no approval needed.',
      '  32 to 92 days old       Needs Super Admin approval. Request the window from the Timesheets',
      '                          page first; once approved, you can fill any day it covers.',
      '  Older than 92 days      Blocked. Contact a Super Admin.',
      '',
      'A Super Admin is not subject to these windows.',
      '',
      'WHY THERE IS A LIMIT AT ALL',
      '',
      'Billable hours, capacity and performance are all derived from timesheets. A month-old sheet',
      'changes numbers people have already reported, so the further back an edit reaches the more',
      'oversight it needs. Filling in as you go avoids the approval entirely.',
      '',
      'REMINDERS',
      '',
      'The Timesheets page colours each day by how complete it is, and you are reminded about days',
      'left unfilled. A day with no entry is not assumed to be a day off.',
    ].join('\n'),
  },
  {
    title: 'Client confidentiality and patent handles',
    category: 'Confidentiality',
    description:
      'Describes the concealment the Dashboard enforces. The firm\'s client confidentiality ' +
      'obligations are contractual and wider than this — HR and management to review.',
    body: [
      'WHY PATENTS APPEAR AS HANDLES',
      '',
      'Patents are shown throughout the Dashboard as handles — Pat_ABC_001 — rather than as patent',
      'numbers. The handle is what belongs in task titles, in discussion, and in anything a',
      'colleague might see over your shoulder.',
      '',
      'The real patent number is stored separately and revealed only to a Super Admin, and only',
      'after re-entering the organisation passcode. That second step is deliberate: a permission',
      'protects an account, and a passcode protects against an account left open.',
      '',
      'WHAT THIS MEANS FOR YOU',
      '',
      'Use the handle when referring to a matter anywhere in the Dashboard, in email, and in',
      'conversation. Do not paste patent numbers into task titles, comments or discussion threads —',
      'doing so undoes the concealment for everyone who can see that task.',
      '',
      'Client identity is treated the same way. Client records and their codes are managed only by',
      'those holding patent management rights, and creating or changing one requires the passcode.',
    ].join('\n'),
  },
  {
    title: 'Expenses and reimbursement',
    category: 'Expenses',
    description: CITATION + ' The Dashboard enforces the workflow; the firm sets the spending limits.',
    body: [
      'HOW TO CLAIM',
      '',
      'Raise the claim from the Expenses page, with the receipt attached. Claims are reviewed by an',
      'administrator, and you are notified when yours is decided.',
      '',
      'WHAT THE DASHBOARD DOES AND DOES NOT DECIDE',
      '',
      'The Dashboard enforces the workflow — that a claim is raised by you, carries evidence, and is',
      'approved by somebody other than you. It does not encode what is claimable or up to what',
      'amount. Those limits are the firm\'s to set, and this policy needs them filling in by HR',
      'before it is complete.',
      '',
      'ATTACH THE RECEIPT AT THE TIME',
      '',
      'A claim without evidence will come back to you for it.',
    ].join('\n'),
  },
  {
    title: 'Your personal details and who can see them',
    category: 'Privacy',
    description:
      'Describes the access boundary the Dashboard enforces on personal data. HR to review against ' +
      'the firm\'s data-protection obligations.',
    body: [
      'WHAT COLLEAGUES CAN SEE',
      '',
      'Your name, designation, department, office, reporting manager, work email and contact number',
      'appear in the company directory and are visible to every colleague. This is workplace contact',
      'information and is meant to be shared.',
      '',
      'WHAT THEY CANNOT',
      '',
      'Home address, date of birth, and next-of-kin details are visible ONLY to HR, Administrators',
      'and Super Admins. For everybody else these fields are removed from the response by the server',
      'before it is sent — they are not merely hidden by the page, so they cannot be recovered by',
      'inspecting it.',
      '',
      'Birthdays are the one exception, and a narrow one: the celebrations panel shows the day and',
      'month so colleagues can mark it, and never the year.',
      '',
      'KEEPING IT CURRENT',
      '',
      'You maintain your own details on your profile. Please keep next-of-kin and contact number',
      'accurate — they are what the firm uses in an emergency.',
    ].join('\n'),
  },
  {
    title: 'Appraisals: how a review runs',
    category: 'Performance',
    description: CITATION,
    body: [
      'CADENCE',
      '',
      'The firm runs half-yearly reviews and an annual appraisal.',
      '',
      'THE STEPS, IN ORDER',
      '',
      '1. HR opens a review cycle and launches it.',
      '2. YOU complete your self-assessment. Nothing moves until you do.',
      '3. YOUR REPORTING MANAGER scores each parameter and adds their remarks.',
      '4. A REVIEW CALL is scheduled. It appears on both calendars like any other commitment.',
      '5. YOU acknowledge the outcome.',
      '',
      'HOW THE RATING IS ARRIVED AT',
      '',
      'You are rated on parameters, each 1 to 5, where 5 is highest. The parameters differ by team',
      'and by position — you see the ones that apply to you. The overall rating is the weighted mean',
      'of those scores, carried to one decimal. A parameter left unscored is skipped, not counted as',
      'zero.',
      '',
      'WHO CAN SEE YOUR APPRAISAL',
      '',
      'You, your reporting manager, and HR. Nobody else — not your manager\'s peers, and not',
      'colleagues at any level. A manager can see the history of their own reports and of no one',
      'else.',
    ].join('\n'),
  },
];

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) { console.error('No organization found — run the seed first.'); process.exit(1); }

  // Published by a Super Admin, so the library shows a real author rather than a blank.
  const publisher = await prisma.user.findFirst({
    where: {
      organizationId: org.id, deletedAt: null, status: 'ACTIVE',
      userRoles: { some: { role: { name: 'Super Admin' } } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!publisher) { console.error('No active Super Admin to publish as.'); process.exit(1); }

  console.log(`Policies for ${org.name}, published as ${publisher.firstName} ${publisher.lastName}\n`);
  let created = 0, updated = 0;

  for (const p of POLICIES) {
    // Matched on title so a re-run edits rather than duplicates. Anything HR has since rewritten
    // under the same title WILL be overwritten — say so rather than let it surprise somebody.
    const existing = await prisma.policy.findFirst({
      where: { organizationId: org.id, title: p.title },
      select: { id: true },
    });
    if (existing) {
      await prisma.policy.update({
        where: { id: existing.id },
        data: { description: p.description, category: p.category, body: p.body },
      });
      updated++; console.log(`  updated  ${p.category.padEnd(16)} ${p.title}`);
    } else {
      await prisma.policy.create({
        data: {
          organizationId: org.id, publishedBy: publisher.id,
          title: p.title, description: p.description, category: p.category, body: p.body,
          // Deliberately false — see the header. Acknowledgement means somebody accepted a term of
          // employment; do not ask for it on a draft HR has not read.
          requiresAck: false,
        },
      });
      created++; console.log(`  created  ${p.category.padEnd(16)} ${p.title}`);
    }
  }

  const total = await prisma.policy.count({ where: { organizationId: org.id } });
  console.log(`\n${created} created, ${updated} updated. ${total} polic${total === 1 ? 'y' : 'ies'} in the library.`);
  console.log('Each one states the rule the software enforces. HR should read, edit and sign off,');
  console.log('and turn on acknowledgement per policy once they have.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
