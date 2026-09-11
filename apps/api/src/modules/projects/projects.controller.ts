import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AddProjectRoundDto, ApprovalDto, AttachPidDto, CreateProjectDto, FulfillPidDto, MovePidDto, ReviewPidProjectDto, SetProjectClientDto, SetProjectPatentsDto, UpdateProjectDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import type { MoveMode } from './pid-move';

/**
 * The preview's `mode` arrives as a query string, which can be anything. Anything that is not one
 * of the three is read as a plain reassign — the least surprising of them, and the one whose
 * refusals are the narrowest, so a garbled value can never widen what a caller is allowed to do.
 */
function asMoveMode(raw?: string): MoveMode {
  return raw === 'SPLIT' || raw === 'MERGE' ? raw : 'REASSIGN';
}

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly actor: ActorContextService,
  ) {}

  @Post() @RequirePermission('project.create')
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  // Org comes from the SESSION, never the client query — otherwise an oversight actor could
  // pass another org's id and enumerate its projects (S3). The ?organizationId= param the web
  // still sends is ignored.
  @Get()
  async list(
    @Query('phase') phase?: string,
    @Query('technologyDomain') technologyDomain?: string,
    @Query('sort') sort?: string,
  ) {
    return this.projects.list(await this.actor.requireOrgId(), { phase, technologyDomain, sort });
  }

  /**
   * Project requests routed to me (as their manager) or, for admins, any pending one.
   * Org comes from the SESSION — a client-supplied org here would be a cross-tenant read.
   */
  /** Every project with its full detail (tasks, staffing, hours, delivery) — the Reports module. */
  @Get('full-report') @RequirePermission('report.view')
  async fullReport() {
    return this.projects.fullReport(await this.actor.requireOrgId());
  }

  @Get('pending-approvals')
  async pendingApprovals() {
    return this.projects.pendingApprovals(await this.actor.requireOrgId());
  }

  /** People who can be nominated as a project's manager (i.e. can approve it). Session-scoped. */
  @Get('eligible-managers')
  async eligibleManagers() {
    return this.projects.eligibleManagers(await this.actor.requireOrgId());
  }

  /** The catalog of project types (built-ins + org custom templates) + their task templates. */
  @Get('types')
  async projectTypes() {
    return this.projects.projectTypes(await this.actor.requireOrgId());
  }

  /** Built-in technology domains + the org's saved custom ones, alphabetical. */
  @Get('technology-domains')
  async technologyDomains() {
    return this.projects.technologyDomains(await this.actor.requireOrgId());
  }

  /** Non-binding preview of the PID the next created project would receive. */
  @Get('next-pid')
  nextPid() {
    return this.projects.nextPid();
  }

  /** Reserve a Project ID (the "Generate PID" button) for 5 minutes. Authority only. */
  @Post('generate-pid') @RequirePermission('project.generate_pid')
  async generatePid() {
    return this.projects.generatePid(await this.actor.requireOrgId(), this.actor.requireActorId());
  }

  /** My current un-attached PID (for the countdown), or null. Authority only. */
  @Get('pid-reservation') @RequirePermission('project.generate_pid')
  async myReservation() {
    return this.projects.myReservation(await this.actor.requireOrgId(), this.actor.requireActorId());
  }

  /** The full PID ledger (working / discontinued / history). Admin + Super Admin only. */
  @Get('pid-ledger') @RequirePermission('user.manage_access')
  async pidLedger() {
    return this.projects.allReservations(await this.actor.requireOrgId());
  }

  /** People who can assign a PID (project.generate_pid) — the request dropdown. */
  @Get('pid-authorities') @RequirePermission('project.create')
  async pidAuthorities() {
    return this.projects.pidAuthorities(await this.actor.requireOrgId());
  }

  /** My incoming PID requests, as an authority — the fulfilment queue. */
  @Get('pid-requests') @RequirePermission('project.generate_pid')
  async pidRequests() {
    return this.projects.pidRequestsFor(await this.actor.requireOrgId(), this.actor.requireActorId());
  }

  /** Verify/edit the pending project's details before assigning its PID (assignee-gated). */
  @Patch('pid-requests/:id/project') @RequirePermission('project.generate_pid')
  async editPidRequestProject(@Param('id') id: string, @Body() dto: ReviewPidProjectDto) {
    return this.projects.editPidRequestProject(
      await this.actor.requireOrgId(), this.actor.requireActorId(), id, dto,
    );
  }

  /** Assign a PID to a pending-request project. */
  @Post('pid-requests/:id/fulfill') @RequirePermission('project.generate_pid')
  async fulfillPidRequest(@Param('id') id: string, @Body() dto: FulfillPidDto) {
    return this.projects.fulfillPidRequest(
      await this.actor.requireOrgId(), this.actor.requireActorId(), id, dto.pid,
    );
  }

  /**
   * Existing Project IDs this project could be merged into — numbers in the same financial year
   * that still hold live work. Declared with the other static routes because `@Get(':id')` below
   * would otherwise swallow the path.
   */
  @Get(':id/pid-move/targets') @RequirePermission('project.generate_pid')
  async pidMoveTargets(@Param('id') id: string) {
    return this.projects.pidMoveTargets(await this.actor.requireOrgId(), id);
  }

  /**
   * What a PID move WOULD do, before anyone commits to it: the number given up, the number taken,
   * whether the old one is retired, and which OTHER projects it renumbers. Read-only, so it is
   * permission-gated but deliberately not passcode-gated — asking for the step-up passcode to look
   * at a preview is how people learn to type it without reading.
   */
  @Get(':id/pid-move') @RequirePermission('project.generate_pid')
  async pidMovePreview(
    @Param('id') id: string,
    @Query('mode') mode?: string,
    @Query('pid') pid?: string,
    @Query('intoProjectId') intoProjectId?: string,
  ) {
    return this.projects.pidMovePreview(await this.actor.requireOrgId(), id, {
      mode: asMoveMode(mode), pid, intoProjectId,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Patch(':id') @RequirePermission('project.update')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  /**
   * Replace the project's tagged patents. `project.update` + project access is the whole gate —
   * per the Phase 2 decision, tagging follows who may EDIT THE PROJECT, not who may see the
   * confidential patent portal.
   */
  @Put(':id/patents') @RequirePermission('project.update')
  setPatents(@Param('id') id: string, @Body() dto: SetProjectPatentsDto) {
    return this.projects.setPatents(id, dto.patentIds ?? []);
  }

  /**
   * Name the project's client directly. Only possible while the project has NO tagged patents —
   * when it has them, they decide. The service additionally requires `patent.manage`, because a
   * client's identity is confidential in a way a patent handle is not.
   */
  @Put(':id/client') @RequirePermission('project.update')
  setClient(@Param('id') id: string, @Body() dto: SetProjectClientDto) {
    return this.projects.setClient(id, dto.clientId ?? null);
  }

  @Post(':id/members') @RequirePermission('project.update')
  addMember(@Param('id') id: string, @Body() body: { userId: string; projectRole?: string }) {
    return this.projects.addMember(id, body.userId, body.projectRole);
  }

  @Delete(':id/members/:userId') @RequirePermission('project.update')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(id, userId);
  }

  /** What the completion form should prefill "working hours" with (logged time, else estimates). */
  @Get(':id/completion-hours') @RequirePermission('project.view')
  completionHours(@Param('id') id: string) {
    return this.projects.completionHoursSuggestion(id);
  }

  /** Start ANOTHER project under this one's PID — the returning-client flow (Jaipur). */
  @Post(':id/rounds') @RequirePermission('project.create')
  addRound(@Param('id') id: string, @Body() body: AddProjectRoundDto) {
    return this.projects.addRound(id, body);
  }

  /** Every project sharing this one's PID, oldest first — drives the PID page's cards. */
  @Get(':id/rounds')
  async rounds(@Param('id') id: string) {
    return this.projects.roundsForProject(id);
  }

  @Post(':id/complete') @RequirePermission('project.update')
  complete(@Param('id') id: string, @Body() body?: { clientDeliveryDate?: string; workingHours?: number; actualHours?: number }) {
    return this.projects.complete(id, body);
  }



  @Post(':id/reopen') @RequirePermission('project.update')
  reopen(@Param('id') id: string) {
    return this.projects.reopen(id);
  }

  /** Re-initialize a COMPLETED project for a returning client — same PID, existing data reused. */
  @Post(':id/reinitialize') @RequirePermission('project.update')
  reinitialize(@Param('id') id: string) {
    return this.projects.reinitialize(id);
  }

  /** Attach a fresh PID to a project that has none (e.g. a reopened one). Authority only. */
  @Post(':id/attach-pid') @RequirePermission('project.generate_pid')
  async attachPid(@Param('id') id: string, @Body() dto: AttachPidDto) {
    return this.projects.attachPidToProject(
      await this.actor.requireOrgId(), this.actor.requireActorId(), id, dto.pid,
    );
  }

  /**
   * ── Correcting a Project ID ────────────────────────────────────────────────────
   * Three routes for what is mechanically one operation, because they are three different claims
   * about what went wrong and each rules out a different mistake. Splitting checks that something
   * is actually sharing the number; merging checks that the destination actually holds work. One
   * route taking a "mode" would let a caller ask for a split and be given a merge.
   *
   * All three mint or retire a number the firm files work under, so all three carry the org
   * step-up passcode on top of `project.generate_pid` (Admin / Super Admin — a Manager REQUESTS a
   * PID, they do not issue one, and they certainly do not move one).
   */

  /** The number on this project is wrong: move it to another one, or to a freshly minted one. */
  @Post(':id/pid/reassign') @RequirePermission('project.generate_pid') @RequirePasscode()
  async reassignPid(@Param('id') id: string, @Body() dto: MovePidDto) {
    return this.projects.movePid(await this.actor.requireOrgId(), this.actor.requireActorId(), id, {
      mode: 'REASSIGN', pid: dto.pid, intoProjectId: dto.intoProjectId,
    });
  }

  /** This project is sharing a PID with others and is really a separate matter: give it its own. */
  @Post(':id/pid/split') @RequirePermission('project.generate_pid') @RequirePasscode()
  async splitPid(@Param('id') id: string, @Body() dto: MovePidDto) {
    return this.projects.movePid(await this.actor.requireOrgId(), this.actor.requireActorId(), id, {
      mode: 'SPLIT', pid: dto.pid, intoProjectId: dto.intoProjectId,
    });
  }

  /** Two numbers, one matter: move this project under another's PID as its next round. */
  @Post(':id/pid/merge') @RequirePermission('project.generate_pid') @RequirePasscode()
  async mergePid(@Param('id') id: string, @Body() dto: MovePidDto) {
    return this.projects.movePid(await this.actor.requireOrgId(), this.actor.requireActorId(), id, {
      mode: 'MERGE', pid: dto.pid, intoProjectId: dto.intoProjectId,
    });
  }

  @Post(':id/approve') @RequirePermission('project.approve')
  approve(@Param('id') id: string, @Body() dto: ApprovalDto) {
    return this.projects.decide(id, true, dto);
  }

  @Post(':id/reject') @RequirePermission('project.approve')
  reject(@Param('id') id: string, @Body() dto: ApprovalDto) {
    return this.projects.decide(id, false, dto);
  }

  @Delete(':id') @RequirePermission('project.delete')
  remove(@Param('id') id: string) {
    return this.projects.softDelete(id);
  }
}
