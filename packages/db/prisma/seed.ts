// Idempotent seed: safe to re-run on existing DB.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');

  // ── Organization ────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { code: 'pdash-demo' },
    update: {},
    create: { name: 'Acme Corp', code: 'pdash-demo', status: 'ACTIVE' },
  });

  // ── Roles ───────────────────────────────────────────────────
  const adminRole = await upsertById('role', 'role-admin', {
    organizationId: org.id, name: 'Admin', description: 'Full administrative access',
  });
  const managerRole = await upsertById('role', 'role-manager', {
    organizationId: org.id, name: 'Manager', description: 'Project manager',
  });
  const employeeRole = await upsertById('role', 'role-employee', {
    organizationId: org.id, name: 'Employee', description: 'Standard employee',
  });

  // ── Users ───────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'admin@acme.com' } },
    update: {},
    create: {
      organizationId: org.id, firstName: 'Sarah', lastName: 'Admin',
      email: 'admin@acme.com', designation: 'Platform Admin', status: 'ACTIVE',
      userRoles: { create: { roleId: adminRole.id } },
    },
  });
  const alice = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'alice@acme.com' } },
    update: {},
    create: {
      organizationId: org.id, firstName: 'Alice', lastName: 'Kim',
      email: 'alice@acme.com', designation: 'Product Manager', status: 'ACTIVE',
      userRoles: { create: { roleId: managerRole.id } },
    },
  });
  const bob = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'bob@acme.com' } },
    update: {},
    create: {
      organizationId: org.id, firstName: 'Bob', lastName: 'Taylor',
      email: 'bob@acme.com', designation: 'Senior Engineer', status: 'ACTIVE',
      userRoles: { create: { roleId: employeeRole.id } },
    },
  });
  const carol = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'carol@acme.com' } },
    update: {},
    create: {
      organizationId: org.id, firstName: 'Carol', lastName: 'Patel',
      email: 'carol@acme.com', designation: 'UI Designer', status: 'ACTIVE',
      userRoles: { create: { roleId: employeeRole.id } },
    },
  });

  // ── Default Workflow ─────────────────────────────────────────
  let workflow = await prisma.workflow.findFirst({ where: { name: 'Default Task Workflow' } });
  if (!workflow) {
    workflow = await prisma.workflow.create({
      data: {
        name: 'Default Task Workflow', type: 'GLOBAL',
        statuses: {
          create: [
            { name: 'Open',        type: 'OPEN',   colorHex: '#1a73e8', sequence: 1 },
            { name: 'In Progress', type: 'OPEN',   colorHex: '#f9ab00', sequence: 2 },
            { name: 'In Review',   type: 'OPEN',   colorHex: '#9334e6', sequence: 3 },
            { name: 'Closed',      type: 'CLOSED', colorHex: '#188038', sequence: 4 },
          ],
        },
      },
    });
  }
  const statuses = await prisma.workflowStatus.findMany({ where: { workflowId: workflow.id }, orderBy: { sequence: 'asc' } });
  const sOpen     = statuses.find(s => s.name === 'Open')!;
  const sProgress = statuses.find(s => s.name === 'In Progress')!;
  const sReview   = statuses.find(s => s.name === 'In Review')!;
  const sClosed   = statuses.find(s => s.name === 'Closed')!;

  // ── D1 AutomationRule ────────────────────────────────────────
  await upsertById('automationRule', 'rule-milestone-autocomplete', {
    name: 'Auto-complete milestone when all tasks close',
    trigger:   { event: 'task.status_changed' },
    condition: { all_milestone_tasks_closed: true },
    action:    { set_milestone_workflow_status: 'CLOSED' },
    isEnabled: true,
  });

  // ── Project 1: Apollo Website Redesign ──────────────────────
  if (!await prisma.project.findFirst({ where: { title: 'Apollo Website Redesign', deletedAt: null } })) {
    const p1 = await prisma.project.create({
      data: {
        title: 'Apollo Website Redesign',
        description: 'Complete overhaul of the public-facing website with modern UI and improved performance.',
        projectPhase: 'ACTIVE', priority: 'HIGH', completionPercentage: 62,
        workflowId: workflow.id, currentWorkflowStatusId: sOpen.id, createdBy: alice.id,
        dueDate: new Date('2026-08-15'),
        members: { create: [
          { userId: alice.id, projectRole: 'MANAGER' },
          { userId: bob.id,   projectRole: 'DEVELOPER' },
          { userId: carol.id, projectRole: 'DESIGNER' },
        ]},
        taskLists: { create: { name: 'General', isDefault: true, sequence: 0 } },
      },
      include: { taskLists: true },
    });
    const gl = p1.taskLists[0];

    const m1 = await prisma.milestone.create({
      data: { projectId: p1.id, name: 'Phase 1 — Discovery', ownerId: alice.id, startDate: new Date('2026-06-01'), endDate: new Date('2026-07-01'), sequence: 0 },
    });
    const sl = await prisma.taskList.create({
      data: { projectId: p1.id, milestoneId: m1.id, name: 'Sprint 1', sequence: 1 },
    });

    const tasks = [
      { title: 'Define information architecture', statusId: sClosed.id,   pct: 100, priority: 'HIGH',   listId: gl.id, mid: null,   uid: alice.id },
      { title: 'Create wireframes for all pages', statusId: sProgress.id, pct: 50,  priority: 'HIGH',   listId: sl.id, mid: m1.id, uid: carol.id },
      { title: 'Design component library',        statusId: sOpen.id,     pct: 0,   priority: 'MEDIUM', listId: sl.id, mid: m1.id, uid: carol.id },
      { title: 'Implement responsive navbar',     statusId: sOpen.id,     pct: 0,   priority: 'MEDIUM', listId: gl.id, mid: null,   uid: bob.id },
      { title: 'SEO audit and meta tag updates',  statusId: sOpen.id,     pct: 0,   priority: 'LOW',    listId: gl.id, mid: null,   uid: bob.id },
      { title: 'Performance benchmark baseline',  statusId: sReview.id,   pct: 75,  priority: 'HIGH',   listId: sl.id, mid: m1.id, uid: bob.id },
    ];
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const task = await prisma.task.create({
        data: {
          title: t.title, priority: t.priority, completionPercentage: t.pct,
          workflowId: workflow.id, currentWorkflowStatusId: t.statusId, createdBy: alice.id,
          dueDate: new Date('2026-07-28'),
          assignees: { create: { userId: t.uid } },
        },
      });
      await prisma.projectTask.create({
        data: { projectId: p1.id, taskId: task.id, taskListId: t.listId, milestoneId: t.mid ?? undefined, sequence: i },
      });
    }
    await prisma.approval.create({
      data: {
        entityType: 'PROJECT', entityId: p1.id, status: 'APPROVED', requestedBy: alice.id,
        actions: { create: { userId: admin.id, action: 'APPROVE', comments: 'Approved at kickoff' } },
      },
    });
    console.log('Created project: Apollo Website Redesign');
  }

  // ── Project 2: Mobile App v2.0 ───────────────────────────────
  if (!await prisma.project.findFirst({ where: { title: 'Mobile App v2.0', deletedAt: null } })) {
    const p2 = await prisma.project.create({
      data: {
        title: 'Mobile App v2.0',
        description: 'Native iOS and Android app with offline capabilities and real-time sync.',
        projectPhase: 'PLANNING', priority: 'CRITICAL', completionPercentage: 18,
        workflowId: workflow.id, currentWorkflowStatusId: sOpen.id, createdBy: bob.id,
        dueDate: new Date('2026-10-01'),
        members: { create: [
          { userId: bob.id,   projectRole: 'MANAGER' },
          { userId: carol.id, projectRole: 'DESIGNER' },
        ]},
        taskLists: { create: { name: 'General', isDefault: true, sequence: 0 } },
      },
      include: { taskLists: true },
    });
    const task = await prisma.task.create({
      data: {
        title: 'Define tech stack and architecture', priority: 'CRITICAL',
        workflowId: workflow.id, currentWorkflowStatusId: sProgress.id, createdBy: bob.id,
        assignees: { create: { userId: bob.id } },
      },
    });
    await prisma.projectTask.create({
      data: { projectId: p2.id, taskId: task.id, taskListId: p2.taskLists[0].id, sequence: 0 },
    });
    await prisma.approval.create({
      data: { entityType: 'PROJECT', entityId: p2.id, status: 'PENDING', requestedBy: bob.id },
    });
    console.log('Created project: Mobile App v2.0');
  }

  console.log('Seed complete.');
}

async function upsertById(model: string, id: string, data: Record<string, unknown>) {
  const m = (prisma as any)[model];
  return m.upsert({ where: { id }, update: {}, create: { id, ...data } });
}

main().catch(console.error).finally(() => prisma.$disconnect());
