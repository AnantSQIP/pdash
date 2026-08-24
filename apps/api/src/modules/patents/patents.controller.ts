import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PatentsService } from './patents.service';
import { PatentVisibilityService } from './patent-visibility.service';
import { CreateClientDto, RegisterPatentsDto, UpdateClientDto, UpdatePatentDto } from './dto';
import { MAX_FILE_BYTES, isInlineSafe, type UploadedFileLike } from '../documents/documents.service';
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
    private readonly visibility: PatentVisibilityService,
    private readonly actor: ActorContextService,
  ) {}

  // ── Clients ────────────────────────────────────────────────────────────────
  // Client NAMES are confidential (Super Admin only) — the project picker never needs this;
  // it uses /patents/options (handles only). Only the portal lists clients.
  @Get('clients') @RequirePermission('patent.manage')
  async listClients() {
    return this.patents.listClients(await this.actor.requireOrgId());
  }

  /** Advisory: a suggested code for a name + any clients that look like the same company.
   *  Read-only and creates nothing, so no passcode — the passcode guards the save. */
  @Get('clients/code-suggestion') @RequirePermission('patent.manage')
  async codeSuggestion(@Query('name') name?: string, @Query('typed') typed?: string) {
    return this.patents.suggestCode(await this.actor.requireOrgId(), name ?? '', typed);
  }

  @Post('clients') @RequirePermission('patent.manage') @RequirePasscode()
  async createClient(@Body() dto: CreateClientDto) {
    return this.patents.createClient(await this.actor.requireOrgId(), getActorId()!, dto);
  }

  // Editing a client code re-mints its patent handles → a "big change" → passcode.
  @Patch('clients/:id') @RequirePermission('patent.manage') @RequirePasscode()
  async updateClient(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.patents.updateClient(await this.actor.requireOrgId(), id, dto);
  }

  /**
   * ARCHIVE / RESTORE — reversible and destroys nothing, so no passcode. The step-up prompt is
   * reserved for changes that cannot be walked back; asking for it here would only teach people
   * to type it without reading, which is the failure mode the passcode exists to prevent.
   */
  @Post('clients/:id/archive') @RequirePermission('patent.manage')
  async archiveClient(@Param('id') id: string) {
    return this.patents.setClientArchived(await this.actor.requireOrgId(), getActorId()!, id, true);
  }

  @Post('clients/:id/restore') @RequirePermission('patent.manage')
  async restoreClient(@Param('id') id: string) {
    return this.patents.setClientArchived(await this.actor.requireOrgId(), getActorId()!, id, false);
  }

  // REMOVE — a real delete, and irreversible. patent.manage is Super-Admin-only, and the passcode
  // is the second factor. The service refuses outright while any patent or project still points
  // at the client, so this only ever deletes a code nothing depends on.
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

  /**
   * Look up a patent ID that may be out of date — the one a client quotes back from an email
   * sent before their code was renamed. Handles only, so `patent.view` is the right gate: it
   * reveals nothing the picker does not already show.
   */
  @Get('patents/resolve') @RequirePermission('patent.view')
  async resolve(@Query('handle') handle?: string) {
    return this.patents.resolveHandle(await this.actor.requireOrgId(), handle ?? '');
  }

  /**
   * The patents on ONE PROJECT, with their real numbers, for a member of that project.
   *
   * `patent.view` is the floor; project membership is the actual gate, checked in the service
   * against the same function that decides whether you may open the project at all. An analyst
   * could previously see that their task concerned Pat_ABC_001 and had no way to learn which
   * patent that was — they could not see the thing they were searching for.
   */
  @Get('projects/:projectId/patent-numbers') @RequirePermission('patent.view')
  async patentNumbersForProject(@Param('projectId') projectId: string) {
    return this.visibility.forProject(await this.actor.requireOrgId(), projectId);
  }

  /**
   * "I have the patent number — which ID do I quote?"
   *
   * The reverse lookup, scoped the same way: a match is returned only when the caller shares a
   * project with that patent. Declared BEFORE `patents/:id/...` routes would shadow it — Nest
   * matches in declaration order, and `find-by-number` would otherwise be read as an `:id`.
   */
  @Get('patents/find-by-number') @RequirePermission('patent.view')
  async findByNumber(@Query('q') q?: string) {
    return this.visibility.lookupByNumber(await this.actor.requireOrgId(), q ?? '');
  }

  /**
   * "What is this patent?" — by internal id or by handle, for any colleague with `patent.view`.
   *
   * Open to the whole organisation on purpose. A patent NUMBER is public information; what this
   * firm protects is the association between a patent and a CLIENT, and that never appears in
   * this response at any tier. Gating the number itself only produced the workaround of pasting
   * it into task titles, which puts it somewhere far worse.
   */
  @Get('patents/resolve-number') @RequirePermission('patent.view')
  async resolveNumber(@Query('handle') handle?: string, @Query('id') id?: string) {
    return this.visibility.resolve(await this.actor.requireOrgId(), { handle, patentId: id });
  }

  /** Same lookup addressed by path, for a screen that already holds the patent's id. */
  @Get('patents/:id/number') @RequirePermission('patent.view')
  async patentNumber(@Param('id') id: string) {
    return this.visibility.resolve(await this.actor.requireOrgId(), { patentId: id });
  }

  /** Handle-only options for the project picker. patent.view. */
  @Get('patents/options') @RequirePermission('patent.view')
  async options(@Query('clientId') clientId?: string) {
    return this.patents.patentOptions(await this.actor.requireOrgId(), clientId);
  }

  @Post('patents') @RequirePermission('patent.manage')
  async register(@Body() dto: RegisterPatentsDto) {
    return this.patents.registerPatents(await this.actor.requireOrgId(), getActorId()!, dto);
  }

  // Upload a document (PDF/Word/media) → creates a patent with an auto-generated ID. No passcode
  // (multipart can't carry the step-up prompt, and it's the same surface as attaching a doc).
  @Post('patents/from-document') @RequirePermission('patent.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  async fromDocument(@Body() body: { clientId?: string }, @UploadedFile() file: UploadedFileLike | undefined) {
    return this.patents.createFromDocument(await this.actor.requireOrgId(), getActorId()!, body?.clientId ?? '', file);
  }

  @Patch('patents/:id') @RequirePermission('patent.manage')
  async update(@Param('id') id: string, @Body() dto: UpdatePatentDto) {
    return this.patents.updatePatent(await this.actor.requireOrgId(), id, dto);
  }

  @Delete('patents/:id') @RequirePermission('patent.manage')
  async remove(@Param('id') id: string) {
    return this.patents.deletePatent(await this.actor.requireOrgId(), id);
  }

  // ── Patent document (PDF/media) — attach + stream. patent.manage (no passcode, so the
  //    file link opens directly in the browser and adding docs isn't gated per-action). ──
  @Post('patents/:id/document') @RequirePermission('patent.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  async uploadDocument(@Param('id') id: string, @UploadedFile() file: UploadedFileLike | undefined) {
    return this.patents.attachDocument(await this.actor.requireOrgId(), id, file);
  }

  // Same confidentiality as revealing a real number → org passcode required. The web fetches
  // this as a blob (carrying the passcode header) rather than a plain link.
  @Get('patents/:id/document/content') @RequirePermission('patent.manage') @RequirePasscode()
  async documentContent(@Param('id') id: string, @Res() res: Response) {
    const { doc, data } = await this.patents.documentContent(await this.actor.requireOrgId(), id);
    const inline = isInlineSafe(doc.mimeType);
    res.setHeader('Content-Type', inline ? (doc.mimeType as string) : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(data));
  }
}
