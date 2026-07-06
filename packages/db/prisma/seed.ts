// SquarkIP seed — full reset. Wipes all data and rebuilds an IP/patent-services workspace.
import { PrismaClient, Prisma } from '@prisma/client';
import { hash as argonHash } from '@node-rs/argon2';
import { PERMISSIONS, ROLE_PRESETS, ALL_PERMISSION_CODES } from './permissions-catalog';

const prisma = new PrismaClient();

async function main() {
  // SAFETY: this seed DELETES all data. Refuse to run against a production database
  // unless explicitly overridden, so a stray `db:seed` can never wipe live data.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
    console.error('Refusing to seed in production (it wipes all data). Set ALLOW_PROD_SEED=true to override.');
    process.exit(1);
  }
  console.log('Wiping existing data...');
  // Event/audit + metrics first (AuditLog.user is onDelete: Restrict, so it MUST go before users)
  await prisma.userMetricDaily.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.calendarEventAttendee.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.timesheet.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.approvalAction.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.projectTask.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskList.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.workflowStatus.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.departmentMember.deleteMany();
  await prisma.department.deleteMany();
  // RBAC join tables before roles/permissions/users
  await prisma.permissionOverride.deleteMany();
  await prisma.permissionGroupPermission.deleteMany();
  await prisma.permissionGroupMember.deleteMany();
  await prisma.permissionGroup.deleteMany();
  await prisma.userPermission.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.role.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  console.log('Done. Building SquarkIP workspace...');

  // ─── Organization ─────────────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: { name: 'Squark IP', code: 'pdash-demo', status: 'ACTIVE' },
  });

  // ─── Roles ────────────────────────────────────────────────────────────────
  const superAdminRole = await prisma.role.create({ data: { id: 'role-superadmin', organizationId: org.id, name: 'Super Admin', description: 'Full system access' } });
  const adminRole       = await prisma.role.create({ data: { id: 'role-admin',      organizationId: org.id, name: 'Admin',       description: 'Administrative access' } });
  const managerRole     = await prisma.role.create({ data: { id: 'role-manager',    organizationId: org.id, name: 'Manager',     description: 'Engagement manager' } });
  const seniorConsultantRole = await prisma.role.create({ data: { id: 'role-senior-consultant', organizationId: org.id, name: 'Senior Consultant', description: 'Senior delivery lead — full project & task control, org-wide visibility' } });
  const consultantRole  = await prisma.role.create({ data: { id: 'role-consultant', organizationId: org.id, name: 'Consultant',  description: 'Senior contributor — can assign tasks and shape milestones/issues' } });
  const hrRole          = await prisma.role.create({ data: { id: 'role-hr',         organizationId: org.id, name: 'HR',          description: 'People operations — attendance, leave, holidays, user & department management' } });
  const employeeRole    = await prisma.role.create({ data: { id: 'role-employee',   organizationId: org.id, name: 'Employee',    description: 'Team member' } });

  // ─── Permission catalog + Role→Permission presets ───────────────────────────
  await prisma.permission.createMany({
    data: PERMISSIONS.map(p => ({ code: p.code, name: p.name, description: p.description })),
  });
  const allPerms = await prisma.permission.findMany();
  const permIdByCode = new Map(allPerms.map(p => [p.code, p.id]));

  const roleByName: Record<string, string> = {
    'Super Admin': superAdminRole.id,
    Admin: adminRole.id,
    Manager: managerRole.id,
    'Senior Consultant': seniorConsultantRole.id,
    Consultant: consultantRole.id,
    HR: hrRole.id,
    Employee: employeeRole.id,
  };
  const rolePermRows: { roleId: string; permissionId: string }[] = [];
  for (const [roleName, roleId] of Object.entries(roleByName)) {
    const preset = ROLE_PRESETS[roleName];
    const codes = preset === '*' ? ALL_PERMISSION_CODES : preset;
    for (const c of codes) {
      const pid = permIdByCode.get(c);
      if (pid) rolePermRows.push({ roleId, permissionId: pid });
    }
  }
  await prisma.rolePermission.createMany({ data: rolePermRows, skipDuplicates: true });
  console.log(`✓ Permissions: ${allPerms.length} codes, ${rolePermRows.length} role mappings`);

  // ─── Users (real SquarkIP team) ─────────────────────────────────────────────
  // Email is firstname@squarkip.com (first name only, lowercased).
  // Every seeded user shares a dev password (argon2id-hashed) so you can sign in
  // as anyone locally. Override via SEED_DEFAULT_PASSWORD; in prod, real users set
  // their own password via the invite/reset flow.
  const devHash = await argonHash(process.env.SEED_DEFAULT_PASSWORD ?? 'sqip@1234');
  async function makeUser(firstName: string, lastName: string, email: string, designation: string, roleId: string, phone?: string) {
    return prisma.user.create({
      data: {
        organizationId: org.id,
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone: phone ?? null,
        designation,
        status: 'ACTIVE',
        passwordHash: devHash,
        passwordChangedAt: new Date(),
        userRoles: { create: { roleId } },
      },
    });
  }

  // ── Core team — referenced by the project/task/timesheet/attendance data below ──
  const mohit     = await makeUser('Mohit',     'Kalra',     'mohit@squarkip.com',            'VP',                        superAdminRole.id,       '8302971071');
  const yash      = await makeUser('Yash',      'Bhargava',  'yash@squarkip.com',             'VP',                        superAdminRole.id,       '9166876696');
  const arjun     = await makeUser('Arjun',     'Ghosh',     'arjun.ghosh@squarkip.com',      'Research Associate',        employeeRole.id,         '9002766291');
  const vijay     = await makeUser('Vijay',     'Mishra',    'vijay.mishra@squarkip.com',     'Consultant',                consultantRole.id,       '9654129571');
  const basant    = await makeUser('Basant',    'Goyal',     'basant.goyal@squarkip.com',     'Senior Consultant',         seniorConsultantRole.id, '8946889936');
  const khushi    = await makeUser('Khushi',    'Gupta',     'khushi.gupta@squarkip.com',     'Senior Research Associate', employeeRole.id,         '8875555997');
  const meetu     = await makeUser('Meetu',     'Singh',     'meetu.singh@squarkip.com',      'Consultant',                consultantRole.id,       '6376595932');
  const nehu      = await makeUser('Neha',      'Shukla',    'neha.shukla@squarkip.com',      'Consultant',                consultantRole.id,       '9694815249');
  const amrit     = await makeUser('Amritpal',  'Kaur',      'amritpal.kaur@squarkip.com',    'Senior Consultant',         seniorConsultantRole.id, '8699426272');
  const nitin     = await makeUser('Nitin',     'Goel',      'nitin.goel@squarkip.com',       'Manager',                   managerRole.id,          '8826599004');
  const divyanshu = await makeUser('Divyanshu', 'Saxena',    'divyanshu.saxena@squarkip.com', 'Testing and QA',            employeeRole.id,         '6376685331');
  const ankit     = await makeUser('Ankit',     'Verma',     'ankit.verma@squarkip.com',      'Product Development',       managerRole.id,          '7217827713');
  const anant     = await makeUser('Anant',     'Gupta',     'anant.gupta@squarkip.com',      'Product Development',       managerRole.id,          '7206390512');
  const riya      = await makeUser('Riya',      'Bhola',     'riya.bhola@squarkip.com',       'HR',                        hrRole.id,               '9649332546');
  const shaveta   = await makeUser('Shaveta',   'Sharma',    'shavetasharma@squarkip.com',    'HR',                        hrRole.id,               '6280149294');
  const ketan     = await makeUser('Ketan',     'Dagar',     'ketan.dagar@squarkip.com',      'Senior Research Associate', employeeRole.id,         '6284795508');

  // ── Wider roster — additional real team members ──
  await Promise.all([
    makeUser('Ajay',    'Sharma',     'ajay.sharma@squarkip.com',      'Research Associate', employeeRole.id, '9460639443'),
    makeUser('Aman',    'Sharma',     'aman.sharma@squarkip.com',      'Research Associate', employeeRole.id, '6378172788'),
    makeUser('Drishti', 'Jain',       'drishti.jain@squarkip.com',     'Associate',          employeeRole.id, '8305088898'),
    makeUser('HR',      'Admin',      'hr@squarkip.com',               'HR',                 hrRole.id,       '09166876696'),
    makeUser('Poorvi',  'Gupta',      'poorvi.gupta@squarkip.com',     'Research Associate', employeeRole.id, '8209218618'),
    makeUser('Ragini',  'Kumari',     'ragini.kumari@squarkip.com',    'Associate',          employeeRole.id, '7807290342'),
    makeUser('Rajesh',  'Joshi',      'rajesh.joshi@squarkip.com',     'Senior Associate',   employeeRole.id, '9205688453'),
    makeUser('Ritik',   'Sharma',     'ritik.sharma@squarkip.com',     'Research Associate', employeeRole.id, '8194932267'),
    makeUser('Ronak',   'Khandelwal', 'ronak.khandelwal@squarkip.com', 'Associate',          employeeRole.id, '9887145023'),
    makeUser('Sugandh', 'Raghav',     'sugandh.raghav@squarkip.com',   'Research Associate', employeeRole.id, '9456252763'),
    makeUser('Tanisha', 'Jain',       'tanisha.jain@squarkip.com',     'Associate',          employeeRole.id, '7828717606'),
    makeUser('Vandana', 'Boora',      'vandana.boora@squarkip.com',    'Research Associate', employeeRole.id, '9413541413'),
  ]);

  // Role aliases used throughout the data below.
  const admin = mohit;   // VP / approver / "current user"
  const alice = yash;    // engagement manager
  const bob   = arjun;   // lead search analyst
  const carol = khushi;  // analyst
  const dave  = divyanshu; // QA / docketing

  // ─── Departments ──────────────────────────────────────────────────────────
  const deptSearch = await prisma.department.create({ data: { id: 'dept-search',     organizationId: org.id, name: 'Search & Analytics', description: 'Prior-art search and patent analytics' } });
  const deptPros   = await prisma.department.create({ data: { id: 'dept-prosecution',organizationId: org.id, name: 'Prosecution',        description: 'Drafting and prosecution' } });
  const deptTM     = await prisma.department.create({ data: { id: 'dept-trademark',  organizationId: org.id, name: 'Trademarks',         description: 'Trademark watch and filing' } });
  const deptOps    = await prisma.department.create({ data: { id: 'dept-ops',        organizationId: org.id, name: 'Operations',         description: 'Docketing, QA and delivery' } });

  await prisma.departmentMember.createMany({ data: [
    { departmentId: deptSearch.id, userId: arjun.id  },
    { departmentId: deptSearch.id, userId: vijay.id  },
    { departmentId: deptSearch.id, userId: basant.id },
    { departmentId: deptSearch.id, userId: ketan.id  },
    { departmentId: deptSearch.id, userId: khushi.id },
    { departmentId: deptPros.id,   userId: mohit.id  },
    { departmentId: deptPros.id,   userId: meetu.id  },
    { departmentId: deptPros.id,   userId: nehu.id   },
    { departmentId: deptPros.id,   userId: amrit.id  },
    { departmentId: deptTM.id,     userId: yash.id   },
    { departmentId: deptTM.id,     userId: ankit.id  },
    { departmentId: deptTM.id,     userId: anant.id  },
    { departmentId: deptOps.id,    userId: divyanshu.id },
    { departmentId: deptOps.id,    userId: nitin.id  },
    { departmentId: deptOps.id,    userId: riya.id   },
    { departmentId: deptOps.id,    userId: shaveta.id },
  ]});

  // ─── Workflow ─────────────────────────────────────────────────────────────
  const workflow = await prisma.workflow.create({
    data: {
      name: 'Default Task Workflow', type: 'GLOBAL',
      statuses: { create: [
        { name: 'Open',        type: 'OPEN',   colorHex: '#1a73e8', sequence: 1 },
        { name: 'In Progress', type: 'OPEN',   colorHex: '#f9ab00', sequence: 2 },
        { name: 'In Review',   type: 'OPEN',   colorHex: '#9334e6', sequence: 3 },
        { name: 'Closed',      type: 'CLOSED', colorHex: '#188038', sequence: 4 },
      ]},
    },
  });
  const [sOpen, sProgress, sReview, sClosed] = await prisma.workflowStatus.findMany({
    where: { workflowId: workflow.id }, orderBy: { sequence: 'asc' },
  });

  // ─── Helper ─────────────────────────────────────────────────────────────────
  async function makeTask(opts: {
    title: string; priority: string; pct: number; statusId: string;
    createdBy: string; dueDate: string; assignee: string;
    projectId: string; taskListId: string; milestoneId?: string; seq: number;
  }) {
    const task = await prisma.task.create({
      data: {
        title: opts.title, priority: opts.priority, completionPercentage: opts.pct,
        workflowId: workflow.id, currentWorkflowStatusId: opts.statusId,
        createdBy: opts.createdBy, dueDate: new Date(opts.dueDate),
        assignees: { create: { userId: opts.assignee } },
      },
    });
    await prisma.projectTask.create({
      data: { projectId: opts.projectId, taskId: task.id, taskListId: opts.taskListId, milestoneId: opts.milestoneId, sequence: opts.seq },
    });
    return task;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 1 — Prior Art & Invalidation — Wireless SEP Portfolio
  // ══════════════════════════════════════════════════════════════════════════
  const p1 = await prisma.project.create({
    data: {
      title: 'Prior Art & Invalidation — Wireless SEP Portfolio',
      description: 'Invalidity search and claim charting against a portfolio of standard-essential patents (5G/Wi-Fi) for an IPR proceeding.',
      projectPhase: 'ACTIVE', priority: 'HIGH', completionPercentage: 62,
      workflowId: workflow.id, currentWorkflowStatusId: sProgress.id, createdBy: alice.id,
      startDate: new Date('2026-05-01'), dueDate: new Date('2026-08-15'),
      members: { create: [
        { userId: alice.id, projectRole: 'MANAGER'   },
        { userId: bob.id,   projectRole: 'DEVELOPER' },
        { userId: carol.id, projectRole: 'DESIGNER'  },
        { userId: dave.id,  projectRole: 'TESTER'    },
      ]},
    },
  });
  const gl1 = await prisma.taskList.create({ data: { projectId: p1.id, name: 'General', isDefault: true, sequence: 0 } });
  const m1  = await prisma.milestone.create({ data: { projectId: p1.id, name: 'Phase 1 — Search & Mapping',  ownerId: alice.id, startDate: new Date('2026-05-01'), endDate: new Date('2026-06-30'), sequence: 0 } });
  const m2  = await prisma.milestone.create({ data: { projectId: p1.id, name: 'Phase 2 — Claim Charts',      ownerId: bob.id,   startDate: new Date('2026-07-01'), endDate: new Date('2026-08-01'), sequence: 1 } });
  const sl1 = await prisma.taskList.create({ data: { projectId: p1.id, name: 'Sprint 1 — Search', milestoneId: m1.id, sequence: 1 } });
  const sl2 = await prisma.taskList.create({ data: { projectId: p1.id, name: 'Sprint 2 — Charting', milestoneId: m2.id, sequence: 2 } });

  await makeTask({ title: 'Define claim construction for target patents', priority: 'HIGH',   pct: 100, statusId: sClosed.id,   createdBy: alice.id, dueDate: '2026-05-15', assignee: alice.id, projectId: p1.id, taskListId: gl1.id,            seq: 0 });
  await makeTask({ title: 'Keyword & classification search strategy',     priority: 'MEDIUM', pct: 100, statusId: sClosed.id,   createdBy: alice.id, dueDate: '2026-05-20', assignee: bob.id,   projectId: p1.id, taskListId: sl1.id, milestoneId: m1.id, seq: 1 });
  await makeTask({ title: 'Prior-art search — patent databases',          priority: 'HIGH',   pct: 100, statusId: sClosed.id,   createdBy: alice.id, dueDate: '2026-06-10', assignee: bob.id,   projectId: p1.id, taskListId: sl1.id, milestoneId: m1.id, seq: 2 });
  await makeTask({ title: 'Non-patent literature (NPL) search',           priority: 'HIGH',   pct: 70,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-06-30', assignee: carol.id, projectId: p1.id, taskListId: sl1.id, milestoneId: m1.id, seq: 3 });
  await makeTask({ title: 'Build claim chart — Reference A',              priority: 'MEDIUM', pct: 50,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-07-20', assignee: bob.id,   projectId: p1.id, taskListId: sl2.id, milestoneId: m2.id, seq: 4 });
  await makeTask({ title: 'Build claim chart — Reference B',              priority: 'HIGH',   pct: 40,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-07-25', assignee: vijay.id, projectId: p1.id, taskListId: sl2.id, milestoneId: m2.id, seq: 5 });
  await makeTask({ title: 'Foreign patent family check (INPADOC)',        priority: 'LOW',    pct: 0,   statusId: sOpen.id,     createdBy: alice.id, dueDate: '2026-08-01', assignee: ketan.id, projectId: p1.id, taskListId: gl1.id,            seq: 6 });
  await makeTask({ title: 'Senior review of invalidity position',         priority: 'HIGH',   pct: 75,  statusId: sReview.id,   createdBy: alice.id, dueDate: '2026-07-30', assignee: mohit.id, projectId: p1.id, taskListId: sl2.id, milestoneId: m2.id, seq: 7 });
  await makeTask({ title: 'QA pass on claim mapping accuracy',            priority: 'MEDIUM', pct: 0,   statusId: sOpen.id,     createdBy: alice.id, dueDate: '2026-08-10', assignee: dave.id,  projectId: p1.id, taskListId: gl1.id,            seq: 8 });
  await makeTask({ title: 'Draft invalidity search report',              priority: 'MEDIUM', pct: 0,   statusId: sOpen.id,     createdBy: alice.id, dueDate: '2026-08-12', assignee: meetu.id, projectId: p1.id, taskListId: gl1.id,            seq: 9 });
  await makeTask({ title: 'Compile reference bibliography',               priority: 'LOW',    pct: 100, statusId: sClosed.id,   createdBy: alice.id, dueDate: '2026-06-01', assignee: carol.id, projectId: p1.id, taskListId: gl1.id,            seq: 10 });
  await makeTask({ title: 'Client interim findings call',                 priority: 'MEDIUM', pct: 30,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-07-28', assignee: alice.id, projectId: p1.id, taskListId: sl2.id, milestoneId: m2.id, seq: 11 });
  await makeTask({ title: 'Docket IPR statutory deadline',                priority: 'HIGH',   pct: 20,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-06-15', assignee: nitin.id, projectId: p1.id, taskListId: gl1.id,            seq: 12 }); // overdue

  await prisma.issue.createMany({ data: [
    { projectId: p1.id, title: 'Reference C publication date unverified', description: 'Need to confirm the public-availability date of Reference C before relying on it as 102(b) art.', severity: 'MAJOR',    status: 'OPEN',        reportedBy: dave.id,  assigneeId: bob.id,   dueDate: new Date('2026-07-10') },
    { projectId: p1.id, title: 'Claim chart citations missing pin-cites', description: 'Several mappings cite a reference broadly without paragraph/figure pin-cites.',                          severity: 'CRITICAL', status: 'IN_PROGRESS', reportedBy: mohit.id, assigneeId: vijay.id, dueDate: new Date('2026-07-05') },
    { projectId: p1.id, title: 'Translation needed for JP reference',     description: 'JP-H09-xxxxxx requires a certified English translation for the petition.',                                  severity: 'MINOR',    status: 'OPEN',        reportedBy: alice.id, assigneeId: ketan.id, dueDate: new Date('2026-07-15') },
  ]});
  await prisma.approval.create({ data: { entityType: 'PROJECT', entityId: p1.id, status: 'APPROVED', requestedBy: alice.id, actions: { create: { userId: mohit.id, action: 'APPROVE', comments: 'Approved — priority IPR engagement' } } } });
  console.log('✓ Project 1: Prior Art & Invalidation');

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 2 — FTO Analysis — MedTech Wearable
  // ══════════════════════════════════════════════════════════════════════════
  const p2 = await prisma.project.create({
    data: {
      title: 'FTO Analysis — MedTech Wearable',
      description: 'Freedom-to-operate study for a continuous glucose-monitoring wearable ahead of US/EU launch.',
      projectPhase: 'PLANNING', priority: 'CRITICAL', completionPercentage: 18,
      workflowId: workflow.id, currentWorkflowStatusId: sOpen.id, createdBy: bob.id,
      startDate: new Date('2026-06-01'), dueDate: new Date('2026-10-01'),
      members: { create: [
        { userId: bob.id,   projectRole: 'MANAGER'   },
        { userId: carol.id, projectRole: 'DESIGNER'  },
        { userId: dave.id,  projectRole: 'TESTER'    },
        { userId: alice.id, projectRole: 'REVIEWER'  },
      ]},
    },
  });
  const gl2 = await prisma.taskList.create({ data: { projectId: p2.id, name: 'General', isDefault: true, sequence: 0 } });
  const m3  = await prisma.milestone.create({ data: { projectId: p2.id, name: 'M1 — Feature Mapping', ownerId: bob.id,   startDate: new Date('2026-06-01'), endDate: new Date('2026-07-15'), sequence: 0 } });
  const m4  = await prisma.milestone.create({ data: { projectId: p2.id, name: 'M2 — Opinion',         ownerId: alice.id, startDate: new Date('2026-07-15'), endDate: new Date('2026-09-01'), sequence: 1 } });
  const sl3 = await prisma.taskList.create({ data: { projectId: p2.id, name: 'Scoping Sprint', milestoneId: m3.id, sequence: 1 } });

  await makeTask({ title: 'Map product features to search facets', priority: 'CRITICAL', pct: 100, statusId: sClosed.id,   createdBy: bob.id, dueDate: '2026-06-15', assignee: bob.id,   projectId: p2.id, taskListId: sl3.id, milestoneId: m3.id, seq: 0 });
  await makeTask({ title: 'Identify active US patents by assignee',  priority: 'HIGH',     pct: 60,  statusId: sProgress.id, createdBy: bob.id, dueDate: '2026-06-28', assignee: vijay.id, projectId: p2.id, taskListId: sl3.id, milestoneId: m3.id, seq: 1 });
  await makeTask({ title: 'Sensor electrode subsystem search',       priority: 'HIGH',     pct: 40,  statusId: sProgress.id, createdBy: bob.id, dueDate: '2026-07-05', assignee: basant.id,projectId: p2.id, taskListId: gl2.id,            seq: 2 });
  await makeTask({ title: 'BLE data-sync method search',             priority: 'CRITICAL', pct: 0,   statusId: sOpen.id,     createdBy: bob.id, dueDate: '2026-07-10', assignee: arjun.id, projectId: p2.id, taskListId: gl2.id,            seq: 3 });
  await makeTask({ title: 'Screen for expired / lapsed patents',     priority: 'HIGH',     pct: 0,   statusId: sOpen.id,     createdBy: bob.id, dueDate: '2026-07-12', assignee: ketan.id, projectId: p2.id, taskListId: sl3.id, milestoneId: m3.id, seq: 4 });
  await makeTask({ title: 'EP designation & validation check',       priority: 'MEDIUM',   pct: 0,   statusId: sOpen.id,     createdBy: bob.id, dueDate: '2026-07-20', assignee: khushi.id,projectId: p2.id, taskListId: gl2.id,            seq: 5 });
  await makeTask({ title: 'Risk ranking of blocking patents',        priority: 'LOW',      pct: 80,  statusId: sReview.id,   createdBy: bob.id, dueDate: '2026-07-01', assignee: meetu.id, projectId: p2.id, taskListId: gl2.id,            seq: 6 });
  await makeTask({ title: 'QA — search-string coverage audit',       priority: 'MEDIUM',   pct: 0,   statusId: sOpen.id,     createdBy: bob.id, dueDate: '2026-07-15', assignee: dave.id,  projectId: p2.id, taskListId: gl2.id,            seq: 7 });
  await makeTask({ title: 'Prepare FTO scoping memo',                priority: 'HIGH',     pct: 30,  statusId: sProgress.id, createdBy: bob.id, dueDate: '2026-06-20', assignee: carol.id, projectId: p2.id, taskListId: gl2.id,            seq: 8 }); // overdue

  await prisma.issue.createMany({ data: [
    { projectId: p2.id, title: 'Two assignees recently merged — update list', description: 'Assignee A was acquired by Assignee B; portfolio ownership needs reconciliation.', severity: 'CRITICAL', status: 'OPEN',        reportedBy: dave.id, assigneeId: vijay.id, dueDate: new Date('2026-07-05') },
    { projectId: p2.id, title: 'Continuation pending — monitor publication',  description: 'A blocking family has a pending continuation; flag for re-check before opinion issues.', severity: 'MAJOR',    status: 'IN_PROGRESS', reportedBy: bob.id,  assigneeId: arjun.id, dueDate: new Date('2026-07-08') },
    { projectId: p2.id, title: 'Client product spec ambiguous on electrode',  description: 'Spec does not clarify dry vs. wet electrode; affects search scope.',                     severity: 'MINOR',    status: 'OPEN',        reportedBy: dave.id, assigneeId: carol.id                  },
  ]});
  await prisma.approval.create({ data: { entityType: 'PROJECT', entityId: p2.id, status: 'PENDING', requestedBy: bob.id } });
  console.log('✓ Project 2: FTO Analysis');

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 3 — Patent Drafting — AI Accelerator Chipset
  // ══════════════════════════════════════════════════════════════════════════
  const p3 = await prisma.project.create({
    data: {
      title: 'Patent Drafting — AI Accelerator Chipset',
      description: 'Drafting and prosecuting a family of patent applications covering a novel AI inference accelerator architecture.',
      projectPhase: 'ACTIVE', priority: 'HIGH', completionPercentage: 35,
      workflowId: workflow.id, currentWorkflowStatusId: sProgress.id, createdBy: admin.id,
      startDate: new Date('2026-04-01'), dueDate: new Date('2026-09-30'),
      members: { create: [
        { userId: admin.id, projectRole: 'MANAGER'   },
        { userId: bob.id,   projectRole: 'DEVELOPER' },
        { userId: alice.id, projectRole: 'REVIEWER'  },
        { userId: dave.id,  projectRole: 'TESTER'    },
      ]},
    },
  });
  const gl3 = await prisma.taskList.create({ data: { projectId: p3.id, name: 'Backlog', isDefault: true, sequence: 0 } });
  const m5  = await prisma.milestone.create({ data: { projectId: p3.id, name: 'Disclosure & Claims', ownerId: admin.id, startDate: new Date('2026-04-01'), endDate: new Date('2026-05-31'), sequence: 0 } });
  const m6  = await prisma.milestone.create({ data: { projectId: p3.id, name: 'Filing & Prosecution', ownerId: bob.id,  startDate: new Date('2026-06-01'), endDate: new Date('2026-08-15'), sequence: 1 } });
  const sl4 = await prisma.taskList.create({ data: { projectId: p3.id, name: 'Sprint A — Drafting', milestoneId: m5.id, sequence: 1 } });
  const sl5 = await prisma.taskList.create({ data: { projectId: p3.id, name: 'Sprint B — Filing',   milestoneId: m6.id, sequence: 2 } });

  await makeTask({ title: 'Invention disclosure intake & interview', priority: 'HIGH',   pct: 100, statusId: sClosed.id,   createdBy: admin.id, dueDate: '2026-04-20', assignee: meetu.id, projectId: p3.id, taskListId: sl4.id, milestoneId: m5.id, seq: 0 });
  await makeTask({ title: 'Draft independent claims set',            priority: 'HIGH',   pct: 100, statusId: sClosed.id,   createdBy: admin.id, dueDate: '2026-05-15', assignee: nehu.id,  projectId: p3.id, taskListId: sl4.id, milestoneId: m5.id, seq: 1 });
  await makeTask({ title: 'Draft specification & figures',           priority: 'HIGH',   pct: 65,  statusId: sProgress.id, createdBy: admin.id, dueDate: '2026-06-30', assignee: nehu.id,  projectId: p3.id, taskListId: sl5.id, milestoneId: m6.id, seq: 2 });
  await makeTask({ title: 'Prepare IDS & cite references',           priority: 'MEDIUM', pct: 30,  statusId: sProgress.id, createdBy: admin.id, dueDate: '2026-07-15', assignee: amrit.id, projectId: p3.id, taskListId: sl5.id, milestoneId: m6.id, seq: 3 });
  await makeTask({ title: 'Patentability search for novelty check',  priority: 'MEDIUM', pct: 50,  statusId: sProgress.id, createdBy: admin.id, dueDate: '2026-07-20', assignee: basant.id,projectId: p3.id, taskListId: gl3.id,            seq: 4 });
  await makeTask({ title: 'Prepare PCT filing package',              priority: 'LOW',    pct: 0,   statusId: sOpen.id,     createdBy: admin.id, dueDate: '2026-08-01', assignee: nitin.id, projectId: p3.id, taskListId: gl3.id,            seq: 5 });
  await makeTask({ title: 'Respond to restriction requirement',      priority: 'HIGH',   pct: 0,   statusId: sOpen.id,     createdBy: admin.id, dueDate: '2026-08-10', assignee: nehu.id,  projectId: p3.id, taskListId: gl3.id,            seq: 6 });
  await makeTask({ title: 'QA — claim/spec antecedent check',        priority: 'MEDIUM', pct: 0,   statusId: sOpen.id,     createdBy: admin.id, dueDate: '2026-07-25', assignee: dave.id,  projectId: p3.id, taskListId: gl3.id,            seq: 7 });
  await makeTask({ title: 'Docket 12-month PCT deadline',            priority: 'HIGH',   pct: 20,  statusId: sProgress.id, createdBy: admin.id, dueDate: '2026-06-10', assignee: nitin.id, projectId: p3.id, taskListId: gl3.id,            seq: 8 }); // overdue

  await prisma.issue.createMany({ data: [
    { projectId: p3.id, title: 'Inventorship needs confirmation',      description: 'Two contributors may qualify as inventors on the BLE claims — confirm before filing.', severity: 'MAJOR',    status: 'OPEN',     reportedBy: alice.id, assigneeId: nehu.id, dueDate: new Date('2026-07-10') },
    { projectId: p3.id, title: 'Figure numbering inconsistent in spec', description: 'Figures 4 and 5 are swapped between the drawings and the detailed description.',         severity: 'MINOR',    status: 'RESOLVED', reportedBy: dave.id,  assigneeId: nehu.id  },
    { projectId: p3.id, title: 'Possible 101 eligibility risk',        description: 'Independent claim 1 may read as abstract; consider adding hardware tie-in limitations.',  severity: 'CRITICAL', status: 'OPEN',     reportedBy: mohit.id, assigneeId: nehu.id, dueDate: new Date('2026-07-02') },
  ]});
  console.log('✓ Project 3: Patent Drafting');

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 4 — Trademark Watch & Filing — Q3 Brand Portfolio
  // ══════════════════════════════════════════════════════════════════════════
  const p4 = await prisma.project.create({
    data: {
      title: 'Trademark Watch & Filing — Q3 Brand Portfolio',
      description: 'Trademark clearance, watch service, and new filings across US/EU/IN for a client’s Q3 brand launches.',
      projectPhase: 'ACTIVE', priority: 'MEDIUM', completionPercentage: 55,
      workflowId: workflow.id, currentWorkflowStatusId: sProgress.id, createdBy: alice.id,
      startDate: new Date('2026-06-01'), dueDate: new Date('2026-09-30'),
      members: { create: [
        { userId: alice.id, projectRole: 'MANAGER'  },
        { userId: carol.id, projectRole: 'DESIGNER' },
        { userId: admin.id, projectRole: 'REVIEWER' },
      ]},
    },
  });
  const gl4 = await prisma.taskList.create({ data: { projectId: p4.id, name: 'Filings', isDefault: true, sequence: 0 } });

  await makeTask({ title: 'Knockout search — 3 word marks',       priority: 'HIGH',   pct: 100, statusId: sClosed.id,   createdBy: alice.id, dueDate: '2026-06-10', assignee: meetu.id, projectId: p4.id, taskListId: gl4.id, seq: 0 });
  await makeTask({ title: 'Full availability search — primary mark', priority: 'HIGH', pct: 100, statusId: sClosed.id,   createdBy: alice.id, dueDate: '2026-06-15', assignee: nehu.id,  projectId: p4.id, taskListId: gl4.id, seq: 1 });
  await makeTask({ title: 'Prepare US 1(b) application',          priority: 'HIGH',   pct: 60,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-06-30', assignee: amrit.id, projectId: p4.id, taskListId: gl4.id, seq: 2 });
  await makeTask({ title: 'EUIPO classification & goods/services', priority: 'MEDIUM',pct: 40,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-07-05', assignee: khushi.id,projectId: p4.id, taskListId: gl4.id, seq: 3 });
  await makeTask({ title: 'Respond to office action — Mark B',     priority: 'HIGH',   pct: 0,   statusId: sOpen.id,     createdBy: alice.id, dueDate: '2026-07-10', assignee: nehu.id,  projectId: p4.id, taskListId: gl4.id, seq: 4 });
  await makeTask({ title: 'Set up watch alerts (US/EU/IN)',        priority: 'MEDIUM', pct: 50,  statusId: sProgress.id, createdBy: alice.id, dueDate: '2026-07-15', assignee: nitin.id, projectId: p4.id, taskListId: gl4.id, seq: 5 });
  await makeTask({ title: 'Q3 portfolio status report',           priority: 'LOW',    pct: 0,   statusId: sOpen.id,     createdBy: alice.id, dueDate: '2026-09-25', assignee: shaveta.id,projectId: p4.id, taskListId: gl4.id, seq: 6 });

  await prisma.issue.createMany({ data: [
    { projectId: p4.id, title: 'Likely confusion with senior mark', description: 'A cited senior registration is close in sound/appearance for Class 9 — assess response strategy.', severity: 'MAJOR',    status: 'OPEN',        reportedBy: alice.id, assigneeId: nehu.id,  dueDate: new Date('2026-06-30') },
    { projectId: p4.id, title: 'Specimen rejected by examiner',     description: 'Submitted specimen shows ornamental use; need a conforming commercial specimen.',                  severity: 'CRITICAL', status: 'IN_PROGRESS', reportedBy: alice.id, assigneeId: amrit.id, dueDate: new Date('2026-07-05') },
  ]});
  console.log('✓ Project 4: Trademark Watch & Filing');

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT 5 — Patent Landscape — EV Battery Chemistry
  // ══════════════════════════════════════════════════════════════════════════
  const p5 = await prisma.project.create({
    data: {
      title: 'Patent Landscape — EV Battery Chemistry',
      description: 'Technology landscape and white-space analysis of solid-state and Li-metal battery chemistry patents for R&D strategy.',
      projectPhase: 'ON_HOLD', priority: 'MEDIUM', completionPercentage: 20,
      workflowId: workflow.id, currentWorkflowStatusId: sOpen.id, createdBy: admin.id,
      startDate: new Date('2026-07-01'), dueDate: new Date('2026-11-30'),
      members: { create: [
        { userId: admin.id, projectRole: 'MANAGER'   },
        { userId: bob.id,   projectRole: 'DEVELOPER' },
      ]},
    },
  });
  const gl5 = await prisma.taskList.create({ data: { projectId: p5.id, name: 'Landscape Tasks', isDefault: true, sequence: 0 } });

  await makeTask({ title: 'Define taxonomy & search facets',      priority: 'HIGH',     pct: 100, statusId: sClosed.id,   createdBy: admin.id, dueDate: '2026-07-15', assignee: bob.id,    projectId: p5.id, taskListId: gl5.id, seq: 0 });
  await makeTask({ title: 'Bulk dataset extraction & dedup',      priority: 'HIGH',     pct: 40,  statusId: sProgress.id, createdBy: admin.id, dueDate: '2026-08-01', assignee: basant.id, projectId: p5.id, taskListId: gl5.id, seq: 1 });
  await makeTask({ title: 'Assignee & filing-trend analytics',    priority: 'HIGH',     pct: 0,   statusId: sOpen.id,     createdBy: admin.id, dueDate: '2026-08-15', assignee: ketan.id,  projectId: p5.id, taskListId: gl5.id, seq: 2 });
  await makeTask({ title: 'White-space heatmap visualization',    priority: 'MEDIUM',   pct: 0,   statusId: sOpen.id,     createdBy: admin.id, dueDate: '2026-09-01', assignee: vijay.id,  projectId: p5.id, taskListId: gl5.id, seq: 3 });
  await makeTask({ title: 'Key-player citation network map',      priority: 'CRITICAL', pct: 0,   statusId: sOpen.id,     createdBy: admin.id, dueDate: '2026-08-10', assignee: arjun.id,  projectId: p5.id, taskListId: gl5.id, seq: 4 });

  await prisma.issue.createMany({ data: [
    { projectId: p5.id, title: 'Database export hitting record cap', description: 'The bulk export truncates at 10k records; need batched extraction by year.', severity: 'CRITICAL', status: 'OPEN', reportedBy: bob.id, assigneeId: basant.id, dueDate: new Date('2026-07-20') },
  ]});
  console.log('✓ Project 5: Patent Landscape');

  // ══════════════════════════════════════════════════════════════════════════
  // TIMESHEETS — recent week, linked to real tasks
  // ══════════════════════════════════════════════════════════════════════════
  const allPT = await prisma.projectTask.findMany({ include: { task: { select: { id: true, title: true } } } });
  const taskByTitle = (t: string) => allPT.find(pt => pt.task.title === t)?.taskId as string;
  await prisma.timesheet.createMany({ data: [
    { userId: bob.id,    taskId: taskByTitle('Prior-art search — patent databases'),   date: new Date('2026-06-18'), hoursLogged: 6,   billable: true,  notes: 'Database search — US/EP/WO' },
    { userId: carol.id,  taskId: taskByTitle('Non-patent literature (NPL) search'),    date: new Date('2026-06-19'), hoursLogged: 5,   billable: true,  notes: 'IEEE/ACM NPL search' },
    { userId: vijay.id,  taskId: taskByTitle('Build claim chart — Reference B'),       date: new Date('2026-06-20'), hoursLogged: 7,   billable: true,  notes: 'Claim charting' },
    { userId: mohit.id,  taskId: taskByTitle('Senior review of invalidity position'), date: new Date('2026-06-23'), hoursLogged: 3,   billable: true,  notes: 'Senior review' },
    { userId: bob.id,    taskId: taskByTitle('Map product features to search facets'), date: new Date('2026-06-22'), hoursLogged: 5,   billable: true,  notes: 'FTO feature mapping' },
    { userId: vijay.id,  taskId: taskByTitle('Identify active US patents by assignee'),date: new Date('2026-06-24'), hoursLogged: 6,   billable: true,  notes: 'Assignee search' },
    { userId: nehu.id,   taskId: taskByTitle('Draft specification & figures'),         date: new Date('2026-06-21'), hoursLogged: 8,   billable: true,  notes: 'Spec drafting' },
    { userId: amrit.id,  taskId: taskByTitle('Prepare IDS & cite references'),         date: new Date('2026-06-24'), hoursLogged: 4,   billable: true,  notes: 'IDS preparation' },
    { userId: meetu.id,  taskId: taskByTitle('Knockout search — 3 word marks'),        date: new Date('2026-06-20'), hoursLogged: 3.5, billable: true,  notes: 'TM knockout search' },
    { userId: amrit.id,  taskId: taskByTitle('Prepare US 1(b) application'),           date: new Date('2026-06-23'), hoursLogged: 4.5, billable: true,  notes: 'US TM application' },
    { userId: basant.id, taskId: taskByTitle('Bulk dataset extraction & dedup'),       date: new Date('2026-06-24'), hoursLogged: 6,   billable: false, notes: 'Landscape data prep' },
    { userId: dave.id,   taskId: taskByTitle('QA pass on claim mapping accuracy'),     date: new Date('2026-06-25'), hoursLogged: 3,   billable: false, notes: 'QA review' },
  ].filter(t => t.taskId) });
  console.log('✓ Timesheets');

  // ══════════════════════════════════════════════════════════════════════════
  // EXTRA TASKS — populate "My Tasks" for Mohit (current user) + spread to team
  // ══════════════════════════════════════════════════════════════════════════
  await makeTask({ title: 'Approve Q3 client engagement budget',     priority: 'HIGH',     pct: 60,  statusId: sProgress.id, createdBy: mohit.id, dueDate: '2026-06-28', assignee: mohit.id, projectId: p4.id, taskListId: gl4.id, seq: 100 });
  await makeTask({ title: 'Review invalidity opinion before client', priority: 'HIGH',     pct: 40,  statusId: sProgress.id, createdBy: mohit.id, dueDate: '2026-06-22', assignee: mohit.id, projectId: p1.id, taskListId: gl1.id, seq: 101 });
  await makeTask({ title: 'Sign off FTO scope & exclusions',         priority: 'CRITICAL', pct: 0,   statusId: sOpen.id,     createdBy: mohit.id, dueDate: '2026-07-02', assignee: mohit.id, projectId: p2.id, taskListId: gl2.id, seq: 102 });
  await makeTask({ title: 'Quarterly practice OKR planning',         priority: 'CRITICAL', pct: 0,   statusId: sOpen.id,     createdBy: mohit.id, dueDate: '2026-07-05', assignee: mohit.id, projectId: p4.id, taskListId: gl4.id, seq: 103 });
  await makeTask({ title: 'Approve PCT filing strategy',             priority: 'HIGH',     pct: 80,  statusId: sReview.id,   createdBy: mohit.id, dueDate: '2026-06-30', assignee: mohit.id, projectId: p3.id, taskListId: gl3.id, seq: 104 });
  await makeTask({ title: 'Landscape engagement go/no-go',           priority: 'MEDIUM',   pct: 0,   statusId: sOpen.id,     createdBy: mohit.id, dueDate: '2026-07-10', assignee: mohit.id, projectId: p5.id, taskListId: gl5.id, seq: 105 });
  await makeTask({ title: 'Client QBR deck preparation',             priority: 'HIGH',     pct: 50,  statusId: sProgress.id, createdBy: mohit.id, dueDate: '2026-06-26', assignee: mohit.id, projectId: p1.id, taskListId: gl1.id, seq: 106 });
  await makeTask({ title: 'Board update — IP practice metrics',      priority: 'CRITICAL', pct: 35,  statusId: sProgress.id, createdBy: mohit.id, dueDate: '2026-06-27', assignee: mohit.id, projectId: p4.id, taskListId: gl4.id, seq: 107 });
  await makeTask({ title: 'Conflict check — new matter intake',      priority: 'MEDIUM',   pct: 100, statusId: sClosed.id,   createdBy: mohit.id, dueDate: '2026-06-12', assignee: mohit.id, projectId: p3.id, taskListId: gl3.id, seq: 108 });
  await makeTask({ title: 'Hiring plan review with HR',              priority: 'LOW',      pct: 0,   statusId: sOpen.id,     createdBy: mohit.id, dueDate: '2026-07-15', assignee: mohit.id, projectId: p4.id, taskListId: gl4.id, seq: 109 });

  await makeTask({ title: 'Citation pin-cite cleanup pass',          priority: 'HIGH',     pct: 30,  statusId: sProgress.id, createdBy: yash.id,  dueDate: '2026-07-08', assignee: vijay.id,   projectId: p1.id, taskListId: gl1.id, seq: 110 });
  await makeTask({ title: 'Second-pass NPL search (databases)',      priority: 'MEDIUM',   pct: 20,  statusId: sProgress.id, createdBy: yash.id,  dueDate: '2026-07-12', assignee: basant.id,  projectId: p2.id, taskListId: gl2.id, seq: 111 });
  await makeTask({ title: 'Translate DE reference (certified)',      priority: 'HIGH',     pct: 0,   statusId: sOpen.id,     createdBy: yash.id,  dueDate: '2026-07-09', assignee: ketan.id,   projectId: p1.id, taskListId: gl1.id, seq: 112 });
  await makeTask({ title: 'Client onboarding pack — new matter',     priority: 'MEDIUM',   pct: 45,  statusId: sProgress.id, createdBy: ankit.id, dueDate: '2026-07-04', assignee: meetu.id,   projectId: p4.id, taskListId: gl4.id, seq: 113 });
  await makeTask({ title: 'Inventor interview scheduling',           priority: 'MEDIUM',   pct: 60,  statusId: sProgress.id, createdBy: ankit.id, dueDate: '2026-06-29', assignee: nehu.id,    projectId: p3.id, taskListId: gl3.id, seq: 114 });
  await makeTask({ title: 'Family-tree verification (INPADOC)',      priority: 'HIGH',     pct: 0,   statusId: sOpen.id,     createdBy: yash.id,  dueDate: '2026-07-18', assignee: amrit.id,   projectId: p2.id, taskListId: gl2.id, seq: 115 });
  await makeTask({ title: 'Docketing audit — upcoming deadlines',    priority: 'CRITICAL', pct: 0,   statusId: sOpen.id,     createdBy: mohit.id, dueDate: '2026-07-14', assignee: nitin.id,   projectId: p3.id, taskListId: gl3.id, seq: 116 });
  await makeTask({ title: 'Practice roadmap Q4 draft',               priority: 'HIGH',     pct: 25,  statusId: sProgress.id, createdBy: mohit.id, dueDate: '2026-07-20', assignee: ankit.id,   projectId: p4.id, taskListId: gl4.id, seq: 117 });
  await makeTask({ title: 'Service spec — automated watch alerts',   priority: 'HIGH',     pct: 70,  statusId: sReview.id,   createdBy: ankit.id, dueDate: '2026-07-03', assignee: anant.id,   projectId: p4.id, taskListId: gl4.id, seq: 118 });
  await makeTask({ title: 'Team onboarding documentation',           priority: 'LOW',      pct: 50,  statusId: sProgress.id, createdBy: mohit.id, dueDate: '2026-07-22', assignee: riya.id,    projectId: p4.id, taskListId: gl4.id, seq: 119 });
  await makeTask({ title: 'Q3 performance review cycle',             priority: 'MEDIUM',   pct: 10,  statusId: sProgress.id, createdBy: mohit.id, dueDate: '2026-07-25', assignee: shaveta.id, projectId: p4.id, taskListId: gl4.id, seq: 120 });
  await makeTask({ title: 'Landscape analytics SQL queries',         priority: 'MEDIUM',   pct: 40,  statusId: sProgress.id, createdBy: yash.id,  dueDate: '2026-07-11', assignee: ketan.id,   projectId: p5.id, taskListId: gl5.id, seq: 121 });
  console.log('✓ Extra tasks (Mohit + team)');

  // ══════════════════════════════════════════════════════════════════════════
  // CHANNELS
  // ══════════════════════════════════════════════════════════════════════════
  const general = await prisma.channel.create({
    data: {
      organizationId: org.id, name: 'general', type: 'PUBLIC',
      description: 'Firm-wide announcements and general chat', createdBy: mohit.id,
      members: { create: [{ userId: mohit.id }, { userId: yash.id }, { userId: arjun.id }, { userId: khushi.id }, { userId: divyanshu.id }] },
    },
  });
  await prisma.message.createMany({ data: [
    { channelId: general.id, userId: mohit.id, content: 'Welcome to the SquarkIP workspace! Use this channel for firm-wide updates.' },
    { channelId: general.id, userId: yash.id,  content: 'Five active engagements this quarter across search, drafting and trademarks. Strong pipeline 🚀' },
    { channelId: general.id, userId: arjun.id, content: 'SEP invalidity search is on track — claim charts in review by Friday.' },
    { channelId: general.id, userId: khushi.id,content: 'NPL search for the SEP matter is ~70% complete; sharing hits in #search-team.' },
    { channelId: general.id, userId: mohit.id, content: 'Reminder: docketing audit Friday. Please confirm your upcoming statutory deadlines.' },
  ]});

  const search = await prisma.channel.create({
    data: {
      organizationId: org.id, name: 'search-team', type: 'PUBLIC',
      description: 'Prior-art search strategy, hits and de-duplication', createdBy: arjun.id,
      members: { create: [{ userId: arjun.id }, { userId: vijay.id }, { userId: basant.id }, { userId: ketan.id }, { userId: khushi.id }] },
      messages: { create: [
        { userId: arjun.id,  content: 'Pushed the latest hit-list for the SEP matter — 240 results after dedup.' },
        { userId: vijay.id,  content: 'Reference B looks strong for claims 1 and 7. Charting now.' },
        { userId: ketan.id,  content: 'Found a JP family member — flagging for translation.' },
        { userId: basant.id, content: 'EV landscape export keeps capping at 10k; batching by year as a workaround.' },
      ]},
    },
  });

  await prisma.channel.create({
    data: {
      organizationId: org.id, name: 'prosecution', type: 'PUBLIC',
      description: 'Drafting, office actions and filing strategy', createdBy: mohit.id,
      members: { create: [{ userId: mohit.id }, { userId: nehu.id }, { userId: meetu.id }, { userId: amrit.id }] },
      messages: { create: [
        { userId: nehu.id,  content: 'Spec for the AI accelerator is ~65% drafted. Figures 4/5 numbering fixed.' },
        { userId: mohit.id, content: 'Watch the 101 risk on claim 1 — add hardware tie-in limitations.' },
        { userId: amrit.id, content: 'IDS draft ready for review; 18 references cited so far.' },
      ]},
    },
  });

  await prisma.channel.create({
    data: {
      organizationId: org.id, name: 'trademarks', type: 'PUBLIC',
      description: 'Clearance, filings, office actions and watch alerts', createdBy: yash.id,
      members: { create: [{ userId: yash.id }, { userId: meetu.id }, { userId: nehu.id }, { userId: ankit.id }] },
      messages: { create: [
        { userId: meetu.id, content: 'Knockout search clean for two of three marks; the third has a close senior reg.' },
        { userId: yash.id,  content: 'Let\'s prep a consent-agreement argument for the close mark.' },
        { userId: ankit.id, content: 'Watch alerts for US/EU/IN are configured and live.' },
      ]},
    },
  });

  await prisma.channel.create({
    data: {
      organizationId: org.id, name: 'docketing', type: 'PUBLIC',
      description: 'Deadlines, reminders and statutory dates', createdBy: nitin.id,
      members: { create: [{ userId: nitin.id }, { userId: divyanshu.id }, { userId: riya.id }] },
      messages: { create: [
        { userId: nitin.id,     content: 'Upcoming: PCT 12-month deadline for the AI chipset matter — please prioritise.' },
        { userId: divyanshu.id, content: 'QA on claim mapping for the SEP matter starts Monday.' },
      ]},
    },
  });
  console.log('✓ 5 channels with messages');

  // ══════════════════════════════════════════════════════════════════════════
  // CALENDAR EVENTS
  // ══════════════════════════════════════════════════════════════════════════
  const Y = 2026; const JUN = 5; const JUL = 6;
  await prisma.calendarEvent.createMany({ data: [
    { organizationId: org.id, title: 'Engagement Kickoff — SEP Matter',  type: 'MEETING',   color: '#fe841f', startDate: new Date(Y,JUN,2,10,0),  endDate: new Date(Y,JUN,2,11,30),  allDay: false, createdBy: alice.id },
    { organizationId: org.id, title: 'Search Strategy Review',           type: 'MEETING',   color: '#9334e6', startDate: new Date(Y,JUN,5,14,0),  endDate: new Date(Y,JUN,5,15,0),   allDay: false, createdBy: arjun.id },
    { organizationId: org.id, title: 'IPR Statutory Deadline',           type: 'MILESTONE', color: '#dc2626', startDate: new Date(Y,JUN,15),                                         allDay: true,  createdBy: alice.id },
    { organizationId: org.id, title: 'Drafting Review — AI Chipset',     type: 'MEETING',   color: '#fe841f', startDate: new Date(Y,JUN,18,11,0), endDate: new Date(Y,JUN,18,12,0),  allDay: false, createdBy: admin.id },
    { organizationId: org.id, title: 'Practice Retrospective',           type: 'MEETING',   color: '#3d8de2', startDate: new Date(Y,JUN,20,15,0), endDate: new Date(Y,JUN,20,16,0),  allDay: false, createdBy: admin.id },
    { organizationId: org.id, title: 'FTO Kickoff — MedTech Wearable',   type: 'MEETING',   color: '#fe841f', startDate: new Date(Y,JUN,25,9,0),  endDate: new Date(Y,JUN,25,10,0),  allDay: false, createdBy: bob.id   },
    { organizationId: org.id, title: 'Firm All-Hands',                   type: 'MEETING',   color: '#3d8de2', startDate: new Date(Y,JUN,27,15,0), endDate: new Date(Y,JUN,27,16,30), allDay: false, createdBy: admin.id },
    { organizationId: org.id, title: 'Docketing Audit',                  type: 'MEETING',   color: '#3d8de2', startDate: new Date(Y,JUN,30,10,0), endDate: new Date(Y,JUN,30,11,0),  allDay: false, createdBy: nitin.id },
    { organizationId: org.id, title: 'TM Filing Window Opens',           type: 'MILESTONE', color: '#9334e6', startDate: new Date(Y,JUL,1),                                          allDay: true,  createdBy: alice.id },
    { organizationId: org.id, title: 'Weekly Search Sync',               type: 'MEETING',   color: '#9334e6', startDate: new Date(Y,JUL,3,14,0),  endDate: new Date(Y,JUL,3,15,0),   allDay: false, createdBy: arjun.id },
    { organizationId: org.id, title: 'Client QBR — SEP Findings',        type: 'MEETING',   color: '#fe841f', startDate: new Date(Y,JUL,10,13,0), endDate: new Date(Y,JUL,10,14,0),  allDay: false, createdBy: admin.id },
    { organizationId: org.id, title: 'Office Action Response Due',       type: 'MILESTONE', color: '#dc2626', startDate: new Date(Y,JUL,10),                                         allDay: true,  createdBy: alice.id },
    { organizationId: org.id, title: 'PCT 12-Month Deadline',            type: 'MILESTONE', color: '#dc2626', startDate: new Date(Y,JUL,15),                                         allDay: true,  createdBy: nitin.id },
    { organizationId: org.id, title: 'Anant\'s PTO',                     type: 'EVENT',     color: '#6b7280', startDate: new Date(Y,JUL,21),      endDate: new Date(Y,JUL,25),       allDay: true,  createdBy: anant.id },
    { organizationId: org.id, title: 'FTO Opinion Target',               type: 'MILESTONE', color: '#9334e6', startDate: new Date(Y,JUL,31),                                         allDay: true,  createdBy: bob.id   },
  ]});
  console.log('✓ 15 calendar events (June + July)');

  // ══════════════════════════════════════════════════════════════════════════
  // ATTENDANCE & LEAVE — leave types, holidays, requests, recent punch records
  // ══════════════════════════════════════════════════════════════════════════
  await prisma.leaveType.createMany({ data: [
    { organizationId: org.id, name: 'Casual Leave',   code: 'CL',  annualQuota: 12, colorHex: '#3d8de2' },
    { organizationId: org.id, name: 'Sick Leave',     code: 'SL',  annualQuota: 8,  colorHex: '#ef4444' },
    { organizationId: org.id, name: 'Earned Leave',   code: 'EL',  annualQuota: 15, colorHex: '#22c55e' },
    { organizationId: org.id, name: 'Work From Home', code: 'WFH', annualQuota: 24, colorHex: '#9334e6' },
  ]});

  await prisma.holiday.createMany({ data: [
    { organizationId: org.id, name: "New Year's Day",      date: new Date('2026-01-01'), type: 'PUBLIC'  },
    { organizationId: org.id, name: 'Republic Day',        date: new Date('2026-01-26'), type: 'PUBLIC'  },
    { organizationId: org.id, name: 'Holi',                date: new Date('2026-03-04'), type: 'PUBLIC'  },
    { organizationId: org.id, name: 'Good Friday',         date: new Date('2026-04-03'), type: 'OPTIONAL' },
    { organizationId: org.id, name: 'Firm Foundation Day', date: new Date('2026-07-01'), type: 'COMPANY' },
    { organizationId: org.id, name: 'Independence Day',    date: new Date('2026-08-15'), type: 'PUBLIC'  },
    { organizationId: org.id, name: 'Gandhi Jayanti',      date: new Date('2026-10-02'), type: 'PUBLIC'  },
    { organizationId: org.id, name: 'Diwali',              date: new Date('2026-11-08'), type: 'PUBLIC'  },
    { organizationId: org.id, name: 'Christmas',           date: new Date('2026-12-25'), type: 'PUBLIC'  },
  ]});

  await prisma.leaveRequest.createMany({ data: [
    { userId: anant.id,  organizationId: org.id, leaveType: 'EL',  startDate: new Date('2026-07-21'), endDate: new Date('2026-07-25'), numDays: 5, reason: 'Family vacation',  status: 'APPROVED', reviewedBy: mohit.id, reviewedAt: new Date('2026-06-20') },
    { userId: khushi.id, organizationId: org.id, leaveType: 'SL',  startDate: new Date('2026-06-18'), endDate: new Date('2026-06-19'), numDays: 2, reason: 'Fever',            status: 'APPROVED', reviewedBy: yash.id,  reviewedAt: new Date('2026-06-17') },
    { userId: vijay.id,  organizationId: org.id, leaveType: 'CL',  startDate: new Date('2026-07-02'), endDate: new Date('2026-07-03'), numDays: 2, reason: 'Personal work',    status: 'PENDING'  },
    { userId: meetu.id,  organizationId: org.id, leaveType: 'WFH', startDate: new Date('2026-06-30'), endDate: new Date('2026-06-30'), numDays: 1, reason: 'Remote work day',  status: 'PENDING'  },
    { userId: nehu.id,   organizationId: org.id, leaveType: 'CL',  startDate: new Date('2026-05-12'), endDate: new Date('2026-05-12'), numDays: 1, reason: 'Appointment',      status: 'REJECTED', reviewedBy: mohit.id, reviewedAt: new Date('2026-05-10'), reviewNote: 'Critical deadline week' },
  ]});

  // Recent explicit punch records for the leadership (so today/timer + grid show times)
  const attnRows: Prisma.AttendanceCreateManyInput[] = [];
  const baseNow = new Date();
  for (const u of [mohit, yash, nitin]) {
    for (let back = 1; back <= 8; back++) {
      const d = new Date(baseNow.getTime() - back * 86400000);
      const wd = d.getUTCDay();
      if (wd === 0 || wd === 6) continue;
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const checkIn = new Date(date.getTime() + (9 * 60 + 28) * 60000);
      const checkOut = new Date(date.getTime() + (18 * 60 + 12) * 60000);
      const totalHours = Math.round(((checkOut.getTime() - checkIn.getTime()) / 3_600_000) * 100) / 100;
      attnRows.push({ userId: u.id, organizationId: org.id, date, checkIn, checkOut, totalHours, status: 'PRESENT' });
    }
  }
  await prisma.attendance.createMany({ data: attnRows, skipDuplicates: true });
  console.log(`✓ Attendance & Leave: 4 leave types, 9 holidays, 5 leave requests, ${attnRows.length} punch records`);

  // ══════════════════════════════════════════════════════════════════════════
  // HISTORY BACKFILL — ~90 days of timesheets + activity events so the
  // Performance dashboard's trends, heatmaps, sparklines and bullets show data.
  // Deterministic (seeded PRNG), anchored to "now", tied to each user's real tasks.
  // The PerformanceService live-fallback reads these directly, so charts populate
  // even before "Rebuild snapshots" is run.
  // ══════════════════════════════════════════════════════════════════════════
  const allUsers = [mohit, yash, arjun, vijay, basant, khushi, meetu, nehu, amrit, nitin, divyanshu, ankit, anant, riya, shaveta, ketan];
  // Give tasks an estimate so the "estimated vs actual" bullet chart has data.
  const estByPriority: Record<string, number> = { CRITICAL: 20, HIGH: 14, MEDIUM: 8, LOW: 4 };
  for (const [prio, est] of Object.entries(estByPriority)) {
    await prisma.task.updateMany({ where: { priority: prio, estimatedHours: null, deletedAt: null }, data: { estimatedHours: est } });
  }

  const assignments = await prisma.taskAssignee.findMany({ select: { userId: true, taskId: true } });
  const tasksByUser = new Map<string, string[]>();
  for (const a of assignments) {
    const arr = tasksByUser.get(a.userId) ?? [];
    arr.push(a.taskId);
    tasksByUser.set(a.userId, arr);
  }

  // mulberry32 — small deterministic PRNG so re-seeding produces stable history
  function makeRng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s += 0x6d2b79f5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NOW = new Date();
  const DAYS_BACK = 90;
  const tsRows: Prisma.TimesheetCreateManyInput[] = [];
  const evtRows: Prisma.AnalyticsEventCreateManyInput[] = [];

  allUsers.forEach((u, ui) => {
    const rand = makeRng(1000 + ui);
    const myTasks = tasksByUser.get(u.id) ?? [];
    if (!myTasks.length) return;
    const pick = () => myTasks[Math.floor(rand() * myTasks.length)];
    for (let dback = DAYS_BACK; dback >= 0; dback--) {
      const day = new Date(NOW.getTime() - dback * 86400000);
      const wd = day.getUTCDay();
      if (wd === 0 || wd === 6) continue;       // weekends off
      if (rand() < 0.18) continue;               // ~18% PTO / no-log days
      const date = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
      // 1–2 timesheet entries
      const entries = rand() < 0.5 ? 2 : 1;
      for (let e = 0; e < entries; e++) {
        const hours = Math.round((2 + rand() * 6) * 2) / 2;  // 2–8h in 0.5 steps
        tsRows.push({ userId: u.id, taskId: pick(), date, hoursLogged: hours, billable: rand() > 0.12 });
      }
      // 0–5 activity events during the day
      const nEvents = Math.floor(rand() * 6);
      for (let e = 0; e < nEvents; e++) {
        const roll = rand();
        const eventType = roll < 0.4 ? 'task.status_changed' : roll < 0.7 ? 'comment.created' : roll < 0.85 ? 'task.updated' : 'issue.resolved';
        const createdAt = new Date(date.getTime() + Math.floor(9 + rand() * 8) * 3600000);  // ~09:00–17:00
        const payload: Prisma.InputJsonValue = eventType === 'task.status_changed'
          ? { new: { status: rand() < 0.5 ? 'In Progress' : 'Closed', type: rand() < 0.4 ? 'CLOSED' : 'OPEN' } }
          : {};
        evtRows.push({ eventType, entityType: 'TASK', entityId: pick(), userId: u.id, organizationId: org.id, payload, createdAt });
      }
    }
  });

  for (let i = 0; i < tsRows.length; i += 500) await prisma.timesheet.createMany({ data: tsRows.slice(i, i + 500) });
  for (let i = 0; i < evtRows.length; i += 500) await prisma.analyticsEvent.createMany({ data: evtRows.slice(i, i + 500) });
  console.log(`✓ History backfill: ${tsRows.length} timesheets, ${evtRows.length} activity events (~${DAYS_BACK} days)`);

  console.log('\nSeed complete ✓');
  console.log('  Org:      Squark IP (code: pdash-demo)');
  console.log('  Users:    28 SquarkIP users (@squarkip.com) — current user: Mohit (VP)');
  console.log('  Projects: 5 IP/patent engagements  |  Tasks: 65  |  Timesheets: 12  |  Issues: 14  |  Channels: 5  |  Events: 15');
}

main().catch(console.error).finally(() => prisma.$disconnect());
