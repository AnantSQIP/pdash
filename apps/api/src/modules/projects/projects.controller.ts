import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AddProjectRoundDto, ApprovalDto, CreateProjectDto, MoveCidDto, SetProjectClientDto, SetProjectPatentsDto, UpdateProjectDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import type { MoveMode } from './cid-move';

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

  /**
   * The CID ledger: every CID the organisation has ever issued — live, completed, deleted, merged,
   * retired or permanently deleted — with its clients, hours and full event timeline.
   * Admin, Super Admin and HR (user.manage_access), as the CID ledger it replaces was.
   */
  @Get('cid-ledger') @RequirePermission('user.manage_access')
  async cidLedger() {
    return this.projects.cidLedger(await this.actor.requireOrgId());
  }

  /**
   * Existing CIDs this client could be merged into — numbers in the same financial year that
   * still hold live work. Declared with the other static routes because `@Get(':id')` below
   * would otherwise swallow the path.
   */
  @Get(':id/cid-move/targets') @RequirePermission('project.generate_pid')
  async cidMoveTargets(@Param('id') id: string) {
    return this.projects.cidMoveTargets(await this.actor.requireOrgId(), id);
  }

  /**
   * What a CID move WOULD do, before anyone commits to it: the number given up, the number taken,
   * whether the old one is retired, and which OTHER clients it renumbers. Read-only, so it is
   * permission-gated but deliberately not passcode-gated — asking for the step-up passcode to look
   * at a preview is how people learn to type it without reading.
   */
  @Get(':id/cid-move') @RequirePermission('project.generate_pid')
  async cidMovePreview(
    @Param('id') id: string,
    @Query('mode') mode?: string,
    @Query('cid') cid?: string,
    @Query('intoProjectId') intoProjectId?: string,
  ) {
    return this.projects.cidMovePreview(await this.actor.requireOrgId(), id, {
      mode: asMoveMode(mode), cid, intoProjectId,
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
  // CLIENTS-FLOW: commented out — patent IDs are switched off (common/features.ts).
  // @Put(':id/patents') @RequirePermission('project.update')
  // setPatents(@Param('id') id: string, @Body() dto: SetProjectPatentsDto) {
  //   return this.projects.setPatents(id, dto.patentIds ?? []);
  // }

  /**
   * Name the project's client directly. Only possible while the project has NO tagged patents —
   * when it has them, they decide. The service additionally requires `patent.manage`, because a
   * client's identity is confidential in a way a patent handle is not.
   */
  // CLIENTS-FLOW: commented out — client IDs are switched off (common/features.ts).
  // @Put(':id/client') @RequirePermission('project.update')
  // setClient(@Param('id') id: string, @Body() dto: SetProjectClientDto) {
  //   return this.projects.setClient(id, dto.clientId ?? null);
  // }

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

  /** Start ANOTHER client under this one's CID — the returning-client flow. */
  @Post(':id/rounds') @RequirePermission('project.create')
  addRound(@Param('id') id: string, @Body() body: AddProjectRoundDto) {
    return this.projects.addRound(id, body);
  }

  /** Every client sharing this one's CID, oldest first — drives the client page's cards. */
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

  /** Re-initialize a COMPLETED client for a returning engagement — same CID, existing data reused. */
  @Post(':id/reinitialize') @RequirePermission('project.update')
  reinitialize(@Param('id') id: string) {
    return this.projects.reinitialize(id);
  }

  /**
   * ── Correcting a CID ───────────────────────────────────────────────────────────
   * Three routes for what is mechanically one operation, because they are three different claims
   * about what went wrong and each rules out a different mistake. Splitting checks that something
   * is actually sharing the number; merging checks that the destination actually holds work. One
   * route taking a "mode" would let a caller ask for a split and be given a merge.
   *
   * All three mint or retire a number the firm files work under, so all three carry the org
   * step-up passcode on top of `project.generate_pid` (Admin / Super Admin — labelled "Change CID"
   * in the permission matrix; the code keeps its historical name so no grant has to move).
   */

  /** This client should have a number of its own: move it to the next freshly issued CID. */
  @Post(':id/cid/reassign') @RequirePermission('project.generate_pid') @RequirePasscode()
  async reassignCid(@Param('id') id: string, @Body() dto: MoveCidDto) {
    return this.projects.moveCid(await this.actor.requireOrgId(), this.actor.requireActorId(), id, {
      mode: 'REASSIGN', cid: dto.cid, intoProjectId: dto.intoProjectId,
    });
  }

  /** This client shares a CID with others and is really a separate matter: give it its own. */
  @Post(':id/cid/split') @RequirePermission('project.generate_pid') @RequirePasscode()
  async splitCid(@Param('id') id: string, @Body() dto: MoveCidDto) {
    return this.projects.moveCid(await this.actor.requireOrgId(), this.actor.requireActorId(), id, {
      mode: 'SPLIT', cid: dto.cid, intoProjectId: dto.intoProjectId,
    });
  }

  /** Two numbers, one matter: move this client under another's CID as its next round. */
  @Post(':id/cid/merge') @RequirePermission('project.generate_pid') @RequirePasscode()
  async mergeCid(@Param('id') id: string, @Body() dto: MoveCidDto) {
    return this.projects.moveCid(await this.actor.requireOrgId(), this.actor.requireActorId(), id, {
      mode: 'MERGE', cid: dto.cid, intoProjectId: dto.intoProjectId,
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
