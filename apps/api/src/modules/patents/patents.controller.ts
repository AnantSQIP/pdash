import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PatentsService } from './patents.service';
import { CreateClientDto, RegisterPatentsDto, UpdatePatentDto } from './dto';
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

  @Get('patents/:id/document/content') @RequirePermission('patent.manage')
  async documentContent(@Param('id') id: string, @Res() res: Response) {
    const { doc, data } = await this.patents.documentContent(await this.actor.requireOrgId(), id);
    const inline = isInlineSafe(doc.mimeType);
    res.setHeader('Content-Type', inline ? (doc.mimeType as string) : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(data));
  }
}
