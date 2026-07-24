import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ApprovalDto, CreateProjectDto, FulfillPidDto, UpdateProjectDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

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
  async list(@Query('phase') phase?: string) {
    return this.projects.list(await this.actor.requireOrgId(), { phase });
  }

  /**
   * Project requests routed to me (as their manager) or, for admins, any pending one.
   * Org comes from the SESSION — a client-supplied org here would be a cross-tenant read.
   */
  @Get('pending-approvals')
  async pendingApprovals() {
    return this.projects.pendingApprovals(await this.actor.requireOrgId());
  }

  /** People who can be nominated as a project's manager (i.e. can approve it). Session-scoped. */
  @Get('eligible-managers')
  async eligibleManagers() {
    return this.projects.eligibleManagers(await this.actor.requireOrgId());
  }

  /** The catalog of project types + their auto-created task templates (for the create form). */
  @Get('types')
  projectTypes() {
    return this.projects.projectTypes();
  }

  /** Non-binding preview of the PID the next created project would receive. */
  @Get('next-pid')
  nextPid() {
    return this.projects.nextPid();
  }

  /** Mint a Project ID on demand (the "Generate PID" button). Authority only. */
  @Post('generate-pid') @RequirePermission('project.generate_pid')
  async generatePid() {
    return this.projects.generatePid(await this.actor.requireOrgId());
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

  /** Assign a PID to a pending-request project. */
  @Post('pid-requests/:id/fulfill') @RequirePermission('project.generate_pid')
  async fulfillPidRequest(@Param('id') id: string, @Body() dto: FulfillPidDto) {
    return this.projects.fulfillPidRequest(
      await this.actor.requireOrgId(), this.actor.requireActorId(), id, dto.pid,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Patch(':id') @RequirePermission('project.update')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Post(':id/members') @RequirePermission('project.update')
  addMember(@Param('id') id: string, @Body() body: { userId: string; projectRole?: string }) {
    return this.projects.addMember(id, body.userId, body.projectRole);
  }

  @Delete(':id/members/:userId') @RequirePermission('project.update')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(id, userId);
  }

  @Post(':id/complete') @RequirePermission('project.update')
  complete(@Param('id') id: string) {
    return this.projects.complete(id);
  }


  @Post(':id/close') @RequirePermission('project.update')
  close(@Param('id') id: string) {
    return this.projects.close(id);
  }

  @Post(':id/reopen') @RequirePermission('project.update')
  reopen(@Param('id') id: string) {
    return this.projects.reopen(id);
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
