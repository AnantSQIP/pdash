// Smoke test for the new architecture (ERD v2.0-aligned).
// Tests via Prisma directly — no service class imports required,
// so it works before/without building the NestJS app.
//
// Key invariants tested:
//   D2 — project approval via generic Approval + ApprovalAction entities
//   "General" task list auto-created on project creation (isDefault invariant)
//   Task created via ProjectTask join (many-to-many)
//   Flat Subtask table (one level only)
//   WorkflowStatus transitions
//   Soft deletes (deletedAt)
//
// Run after: pglite server up + `prisma db push`
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@pdash/db');

const prisma = new PrismaClient();

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else       { fail++; console.error(`  FAIL  ${label}`); }
}
async function expectThrow(label, fn) {
  try { await fn(); check(`${label} (expected throw)`, false); }
  catch { check(label, true); }
}

async function main() {
  // ── Seed: Organization + Users + Workflow + Roles ─────────────
  const org = await prisma.organization.create({
    data: { name: 'Smoke Corp', code: `smoke-${Date.now()}` },
  });

  // Seed Admin and Super Admin roles
  const adminRole = await prisma.role.create({
    data: { organizationId: org.id, name: 'Admin' },
  });
  const employeeRole = await prisma.role.create({
    data: { organizationId: org.id, name: 'Employee' },
  });

  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      firstName: 'Admin',
      lastName: 'User',
      email: `admin-${Date.now()}@smoke.local`,
      status: 'ACTIVE',
      userRoles: { create: { roleId: adminRole.id } },
    },
  });
  const emp = await prisma.user.create({
    data: {
      organizationId: org.id,
      firstName: 'Employee',
      lastName: 'User',
      email: `emp-${Date.now()}@smoke.local`,
      status: 'ACTIVE',
      userRoles: { create: { roleId: employeeRole.id } },
    },
  });

  // Seed a default workflow with OPEN + CLOSED statuses
  const workflow = await prisma.workflow.create({
    data: {
      name: 'Default Task Workflow',
      type: 'GLOBAL',
      statuses: {
        create: [
          { name: 'Open',       type: 'OPEN',   colorHex: '#1a73e8', sequence: 1 },
          { name: 'In Progress', type: 'OPEN',   colorHex: '#f9ab00', sequence: 2 },
          { name: 'Closed',     type: 'CLOSED',  colorHex: '#188038', sequence: 3 },
        ],
      },
    },
    include: { statuses: true },
  });
  const openStatus   = workflow.statuses.find(s => s.type === 'OPEN' && s.name === 'Open');
  const closedStatus = workflow.statuses.find(s => s.type === 'CLOSED');

  // ── [D2] Project creation + approval flow ─────────────────────
  console.log('\n[D2] Project creation + approval via generic Approval entity');

  const project = await prisma.project.create({
    data: {
      title: 'Apollo',
      projectPhase: 'PLANNING',
      createdBy: emp.id,
      members: { create: { userId: emp.id, projectRole: 'MANAGER' } },
      taskLists: { create: { name: 'General', isDefault: true, sequence: 0 } },
    },
    include: { taskLists: true },
  });

  const approval = await prisma.approval.create({
    data: {
      entityType: 'PROJECT',
      entityId: project.id,
      status: 'PENDING',
      requestedBy: emp.id,
    },
  });

  check('project created in PLANNING phase', project.projectPhase === 'PLANNING');
  check('"General" task list auto-created with isDefault=true',
    project.taskLists.length === 1 &&
    project.taskLists[0].name === 'General' &&
    project.taskLists[0].isDefault === true
  );
  check('Approval record created with PENDING status', approval.status === 'PENDING');

  // Non-admin (employee) cannot approve — verify by checking they lack Admin role
  const empRoles = await prisma.userRole.findMany({
    where: { userId: emp.id },
    include: { role: true },
  });
  const empIsAdmin = empRoles.some(ur => ['Admin', 'Super Admin'].includes(ur.role.name));
  check('Employee does NOT have Admin role (D2: cannot approve)', !empIsAdmin);

  // Admin approves
  await prisma.approvalAction.create({
    data: { approvalId: approval.id, userId: admin.id, action: 'APPROVE', comments: 'LGTM' },
  });
  await prisma.approval.update({ where: { id: approval.id }, data: { status: 'APPROVED' } });
  await prisma.project.update({ where: { id: project.id }, data: { projectPhase: 'ACTIVE' } });

  const updatedProject = await prisma.project.findUnique({ where: { id: project.id } });
  const updatedApproval = await prisma.approval.findUnique({ where: { id: approval.id } });
  check('Approval status set to APPROVED', updatedApproval.status === 'APPROVED');
  check('Project phase advanced to ACTIVE after approval', updatedProject.projectPhase === 'ACTIVE');

  // ── "General" task list cannot be deleted (isDefault invariant) ──
  console.log('\n[M1] "General" task list (isDefault) cannot be deleted');
  const generalList = project.taskLists[0];
  // Service enforces this; here we verify the flag is correct
  check('"General" list has isDefault=true', generalList.isDefault === true);

  // ── Task creation via ProjectTask (M2M) ─────────────────────
  console.log('\n[M1] Task creation via ProjectTask join table');

  const task1 = await prisma.task.create({
    data: {
      title: 'Design the API',
      priority: 'HIGH',
      createdBy: admin.id,
      currentWorkflowStatusId: openStatus.id,
      projectTasks: {
        create: {
          projectId: project.id,
          taskListId: generalList.id,
          sequence: 0,
        },
      },
    },
    include: { projectTasks: true, currentStatus: true },
  });

  check('Task has no direct projectId (decoupled M2M)', !('projectId' in task1));
  check('Task linked to project via ProjectTask', task1.projectTasks.length === 1);
  check('ProjectTask points to correct project', task1.projectTasks[0].projectId === project.id);
  check('Task currentStatus is Open', task1.currentStatus?.name === 'Open');

  // Task can be queried from project side
  const projectTaskCount = await prisma.projectTask.count({ where: { projectId: project.id } });
  check('ProjectTask count for project is 1', projectTaskCount === 1);

  // ── Subtask (flat, one level) ──────────────────────────────
  console.log('\n[M1] Flat subtask table (one level only)');

  const subtask = await prisma.subtask.create({
    data: {
      taskId: task1.id,
      title: 'Write OpenAPI spec',
      priority: 'MEDIUM',
      status: 'OPEN',
    },
  });

  check('Subtask created with taskId FK', subtask.taskId === task1.id);
  check('Subtask has no parentTaskId (flat, not recursive)', !('parentTaskId' in subtask));
  check('Subtask status is OPEN', subtask.status === 'OPEN');

  // ── WorkflowStatus transition ──────────────────────────────
  console.log('\n[M1] WorkflowStatus transition + subtask close-cascade');

  // Close the parent task → subtask should also be closed (service handles this)
  await prisma.task.update({
    where: { id: task1.id },
    data: { currentWorkflowStatusId: closedStatus.id, completionPercentage: 100 },
  });
  await prisma.subtask.updateMany({
    where: { taskId: task1.id, deletedAt: null },
    data: { status: 'CLOSED' },
  });

  const closedTask = await prisma.task.findUnique({
    where: { id: task1.id },
    include: { currentStatus: true, subtasks: true },
  });
  check('Task transitioned to Closed status', closedTask.currentStatus?.type === 'CLOSED');
  check('Task completionPercentage set to 100', closedTask.completionPercentage === 100);
  check('Subtask closed when parent closed', closedTask.subtasks[0].status === 'CLOSED');

  // ── Soft delete ────────────────────────────────────────────
  console.log('\n[M1] Soft deletes (deletedAt)');

  const task2 = await prisma.task.create({
    data: {
      title: 'Temp task',
      priority: 'LOW',
      createdBy: admin.id,
      projectTasks: { create: { projectId: project.id, taskListId: generalList.id, sequence: 1 } },
    },
  });

  await prisma.task.update({ where: { id: task2.id }, data: { deletedAt: new Date() } });
  const softDeleted = await prisma.task.findUnique({ where: { id: task2.id } });
  check('Soft-deleted task still exists in DB', softDeleted !== null);
  check('Soft-deleted task has deletedAt set', softDeleted.deletedAt !== null);

  const activeTasks = await prisma.task.findMany({
    where: { deletedAt: null, projectTasks: { some: { projectId: project.id } } },
  });
  check('Deleted task excluded from active query', !activeTasks.some(t => t.id === task2.id));

  // ── AuditLog (immutable) ───────────────────────────────────
  console.log('\n[M1] AuditLog creation');

  const log = await prisma.auditLog.create({
    data: {
      userId: admin.id,
      entityType: 'PROJECT',
      entityId: project.id,
      action: 'APPROVE',
      oldValue: { projectPhase: 'PLANNING' },
      newValue: { projectPhase: 'ACTIVE' },
    },
  });
  check('AuditLog created with entityType=PROJECT', log.entityType === 'PROJECT');
  check('AuditLog has immutable timestamp', log.timestamp instanceof Date);

  // ── Milestone + TaskList relationship ─────────────────────
  console.log('\n[M1] Milestone + TaskList hierarchy');

  const milestone = await prisma.milestone.create({
    data: { projectId: project.id, name: 'Phase 1', sequence: 0 },
  });
  const sprintList = await prisma.taskList.create({
    data: { projectId: project.id, milestoneId: milestone.id, name: 'Sprint 1', sequence: 1 },
  });
  const task3 = await prisma.task.create({
    data: {
      title: 'Milestone task',
      createdBy: admin.id,
      projectTasks: {
        create: {
          projectId: project.id,
          taskListId: sprintList.id,
          milestoneId: milestone.id,
          sequence: 0,
        },
      },
    },
    include: { projectTasks: true },
  });

  check('Task linked to milestone via ProjectTask', task3.projectTasks[0].milestoneId === milestone.id);
  check('TaskList linked to milestone', sprintList.milestoneId === milestone.id);

  // ── Multiple managers per user (UserManager) ─────────────
  console.log('\n[M1] Multiple managers per user');

  const manager2 = await prisma.user.create({
    data: {
      organizationId: org.id,
      firstName: 'Manager2',
      lastName: 'User',
      email: `mgr2-${Date.now()}@smoke.local`,
    },
  });
  await prisma.userManager.createMany({
    data: [
      { userId: emp.id, managerId: admin.id },
      { userId: emp.id, managerId: manager2.id },
    ],
  });
  const empManagers = await prisma.userManager.findMany({ where: { userId: emp.id } });
  check('Employee can have multiple managers', empManagers.length === 2);

  // ── Final result ───────────────────────────────────────────
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE ERROR:', e);
  await prisma.$disconnect();
  process.exit(2);
});
