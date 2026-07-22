import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PatentsService } from './patents.service';
import { CreateClientDto, RegisterPatentsDto, UpdatePatentDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { getActorId } from '../../common/context/request-context';

/**
 * Phase 2 — the confidential patent portal + the handle-only picker for Phase 1.
 *
 * Security layers: RBAC (`patent.manage` for the real numbers, `patent.view` for handles),
 * the step-up passcode on every mutation, and query-level exclusion in the service so a real
 * number can never reach a `patent.view`-only caller. Org is ALWAYS session-derived.
 */
@Controller()
export class PatentsController {
  constructor(
    private readonly patents: PatentsService,
    private readonly actor: ActorContextService,
  ) {}

  // ── Clients ────────────────────────────────────────────────────────────────
  // Client NAMES are confidential (Super Admin only) — the project picker never needs this;
  // it uses /patents/options (handles only). Only the portal lists clients.
  @Get('clients') @RequirePermission('patent.manage')
  async listClients() {
    return this.patents.listClients(await this.actor.requireOrgId());
  }

  @Post('clients') @RequirePermission('patent.manage') @RequirePasscode()
  async createClient(@Body() dto: CreateClientDto) {
    return this.patents.createClient(await this.actor.requireOrgId(), getActorId()!, dto);
  }

  // Removing a client code (and soft-deleting its patents) is a "big change" → passcode.
  @Delete('clients/:id') @RequirePermission('patent.manage') @RequirePasscode()
  async deleteClient(@Param('id') id: string) {
    return this.patents.deleteClient(await this.actor.requireOrgId(), id);
  }

  // ── Patents ──────────────────────────────────────────────────────────────
  /** OVERVIEW — patent IDs (handles) + serials, NO real numbers. patent.manage, no passcode. */
  @Get('patents') @RequirePermission('patent.manage')
  async listPatents(@Query('clientId') clientId?: string) {
    return this.patents.listPatents(await this.actor.requireOrgId(), clientId);
  }

  /** REVEAL the confidential real patent numbers ("complete data") → org passcode required. */
  @Get('patents/reveal') @RequirePermission('patent.manage') @RequirePasscode()
  async reveal(@Query('clientId') clientId?: string) {
    return this.patents.revealPatents(await this.actor.requireOrgId(), clientId);
  }

  /** Handle-only options for the project picker. patent.view. */
  @Get('patents/options') @RequirePermission('patent.view')
  async options(@Query('clientId') clientId?: string) {
    return this.patents.patentOptions(await this.actor.requireOrgId(), clientId);
  }

  @Post('patents') @RequirePermission('patent.manage') @RequirePasscode()
  async register(@Body() dto: RegisterPatentsDto) {
    return this.patents.registerPatents(await this.actor.requireOrgId(), getActorId()!, dto);
  }

  @Patch('patents/:id') @RequirePermission('patent.manage') @RequirePasscode()
  async update(@Param('id') id: string, @Body() dto: UpdatePatentDto) {
    return this.patents.updatePatent(await this.actor.requireOrgId(), id, dto);
  }

  @Delete('patents/:id') @RequirePermission('patent.manage') @RequirePasscode()
  async remove(@Param('id') id: string) {
    return this.patents.deletePatent(await this.actor.requireOrgId(), id);
  }
}
