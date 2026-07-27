import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { EventService } from '../audit-events/event.service';
import { formatPatentHandle, patentScope } from '../../common/financial-year';
import { isPatentNumber, normalizePatentNumber } from '../../common/patent-number';
import { CreateClientDto, RegisterPatentsDto, UpdateClientDto, UpdatePatentDto } from './dto';
import { DocumentsService, type UploadedFileLike } from '../documents/documents.service';

// ── Default-DENY selects ────────────────────────────────────────────────────
// The confidential `realNumber` is NEVER put in the OVERVIEW select — only the passcode-gated
// `revealPatents` uses FULL_SELECT. So even a super admin never receives real numbers without
// clearing the org passcode. `documentName` is likewise EXCLUDED from the overview: an
// upload-created patent's filename IS its real number, so returning it on the passcode-free
// overview leaked the very secret the reveal gate protects. The overview exposes only
// `documentId` (a boolean-equivalent "has a document") — the bytes/name come from the
// passcode-gated document route.
const PATENT_OVERVIEW_SELECT = { id: true, handle: true, serial: true, clientId: true, documentId: true } as const;
const PATENT_FULL_SELECT = {
  id: true, handle: true, serial: true, clientId: true, realNumber: true, createdAt: true, documentId: true, documentName: true,
} as const;
const CLIENT_MINI = { id: true, name: true, code: true } as const;

@Injectable()
export class PatentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly documents: DocumentsService,
    private readonly events: EventService,
  ) {}

  /**
   * The confidential read paths (reveal, document download) FAIL CLOSED when the org has no
   * step-up passcode configured. The global PasscodeGuard no-ops in that case (so a fresh org
   * can still do ordinary RBAC actions), but for the patent crown-jewels that would silently
   * expose real numbers on RBAC alone — so here we deny until a passcode exists.
   */
  private async assertPasscodeConfigured(organizationId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId }, select: { securityPasscodeHash: true },
    });
    if (!org?.securityPasscodeHash) {
      throw new ForbiddenException('Set an organization passcode before viewing confidential patent data.');
    }
  }

  /** Normalise + validate a real patent number the same way on EVERY entry path (register,
   *  edit, upload) so the same patent can't be stored as two divergent strings + two handles. */
  private cleanRealNumber(raw: string): string | null {
    const norm = normalizePatentNumber(raw).slice(0, 100);
    return isPatentNumber(norm) ? norm : null;
  }

  // ── Client codes (patent.manage) ──────────────────────────────────────────
  listClients(organizationId: string) {
    return this.prisma.client.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, code: true, _count: { select: { patents: { where: { deletedAt: null } } } } },
      orderBy: { code: 'asc' },
    });
  }

  async createClient(organizationId: string, actorId: string, dto: CreateClientDto) {
    const existing = await this.prisma.client.findFirst({
      where: { organizationId, code: dto.code, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new BadRequestException(`A client code "${dto.code}" already exists.`);
    return this.prisma.client.create({
      data: { organizationId, name: dto.name ?? null, code: dto.code, createdBy: actorId },
      select: { id: true, name: true, code: true },
    });
  }

  /** Remove a client code and soft-delete all its patents (passcode-gated at the controller). */
  async deleteClient(organizationId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!client) throw new NotFoundException('Client code not found.');
    const now = new Date();
    // Soft-delete the client's patents AND their linked documents together (a live doc under a
    // deleted patent would otherwise fall back to the generic ACL and leak the real-number PDF).
    const docIds = (await this.prisma.patent.findMany({
      where: { clientId: id, deletedAt: null, documentId: { not: null } }, select: { documentId: true },
    })).map(p => p.documentId!).filter(Boolean);
    await this.prisma.$transaction([
      this.prisma.patent.updateMany({ where: { clientId: id, deletedAt: null }, data: { deletedAt: now } }),
      this.prisma.client.update({ where: { id }, data: { deletedAt: now } }),
      ...(docIds.length ? [this.prisma.document.updateMany({ where: { id: { in: docIds }, deletedAt: null }, data: { deletedAt: now } })] : []),
    ]);
    await this.events.emit({
      action: 'patent.client_deleted', entityType: 'CLIENT', entityId: id, organizationId, metadata: { patentDocs: docIds.length },
    });
    return { ok: true };
  }

  /**
   * Edit a client code / name (#A: fix a typo without delete+recreate). Renaming the CODE
   * re-mints every non-deleted patent's handle to Pat_<newcode>_<serial> so nothing is left
   * inconsistent, and is blocked if the new code is already used by another live client.
   */
  async updateClient(organizationId: string, id: string, dto: UpdateClientDto) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true, code: true },
    });
    if (!client) throw new NotFoundException('Client code not found.');

    const data: { name?: string | null; code?: string } = {};
    if (dto.name !== undefined) data.name = dto.name || null;
    const newCode = dto.code && dto.code !== client.code ? dto.code : null;
    if (newCode) {
      const taken = await this.prisma.client.findFirst({
        where: { organizationId, code: newCode, deletedAt: null, id: { not: id } }, select: { id: true },
      });
      if (taken) throw new BadRequestException(`Client code "${newCode}" is already in use.`);
      data.code = newCode;
    }
    if (!Object.keys(data).length) {
      return this.prisma.client.findUnique({ where: { id }, select: { id: true, name: true, code: true } });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data });
      if (newCode) {
        const patents = await tx.patent.findMany({
          where: { clientId: id, deletedAt: null }, select: { id: true, serial: true },
        });
        for (const p of patents) {
          await tx.patent.update({ where: { id: p.id }, data: { handle: formatPatentHandle(newCode, p.serial) } });
        }
      }
    // A code rename re-mints every handle; give the transaction room so a client with a large
    // portfolio doesn't hit the default 5s interactive-tx timeout (P2028) and roll the rename back.
    }, { timeout: 120_000, maxWait: 10_000 });
    if (newCode) {
      await this.events.emit({
        action: 'patent.client_recoded', entityType: 'CLIENT', entityId: id, organizationId, metadata: { from: client.code, to: newCode },
      });
    }
    return this.prisma.client.findUnique({ where: { id }, select: { id: true, name: true, code: true } });
  }

  // ── Patents ───────────────────────────────────────────────────────────────
  /** OVERVIEW — patent IDs (handles) + serials, NO real numbers. patent.manage, no passcode. */
  listPatents(organizationId: string, clientId?: string) {
    return this.prisma.patent.findMany({
      where: { organizationId, deletedAt: null, ...(clientId ? { clientId } : {}) },
      select: { ...PATENT_OVERVIEW_SELECT, client: { select: CLIENT_MINI } },
      orderBy: [{ clientId: 'asc' }, { serial: 'asc' }],
    });
  }

  /** REVEAL — the confidential real patent numbers. patent.manage + org passcode (controller). */
  async revealPatents(organizationId: string, clientId?: string) {
    await this.assertPasscodeConfigured(organizationId);
    const rows = await this.prisma.patent.findMany({
      where: { organizationId, deletedAt: null, ...(clientId ? { clientId } : {}) },
      select: { ...PATENT_FULL_SELECT, client: { select: CLIENT_MINI } },
      orderBy: [{ clientId: 'asc' }, { serial: 'asc' }],
    });
    // Audit the unmasking of client numbers (WHO + how many + which client — never the numbers).
    await this.events.emit({
      action: 'patent.revealed', entityType: 'PATENT', entityId: clientId ?? 'all',
      organizationId, metadata: { clientId: clientId ?? null, count: rows.length },
    });
    return rows;
  }

  /** Handle-only options for the project picker (patent.view = every delivery role). Returns
   *  ONLY id/handle/serial — never clientId, documentId or documentName, so a non-`patent.manage`
   *  user can't correlate a handle to its client or to the real number embedded in the filename. */
  patentOptions(organizationId: string, clientId?: string) {
    return this.prisma.patent.findMany({
      where: { organizationId, deletedAt: null, ...(clientId ? { clientId } : {}) },
      select: { id: true, handle: true, serial: true },
      orderBy: [{ clientId: 'asc' }, { serial: 'asc' }],
    });
  }

  /** Register one or more real patent numbers under a client, minting Pat_<code>_<serial>. */
  async registerPatents(organizationId: string, actorId: string, dto: RegisterPatentsDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, organizationId, deletedAt: null },
      select: { id: true, code: true },
    });
    if (!client) throw new NotFoundException('Client not found.');

    // Normalise + validate to the SAME canonical form the upload path uses, so a number entered
    // both ways can't create two patents; reject entries that don't look like a patent number
    // (this path previously stored any free text verbatim).
    const cleaned: string[] = [];
    const rejected: string[] = [];
    for (const raw of dto.realNumbers.map(n => n.trim()).filter(Boolean)) {
      const clean = this.cleanRealNumber(raw);
      if (clean) cleaned.push(clean); else rejected.push(raw);
    }
    const wanted = [...new Set(cleaned)];
    if (!wanted.length) {
      throw new BadRequestException(
        rejected.length ? `None of the entries look like a patent number (e.g. US1234567).` : 'Provide at least one patent number.',
      );
    }
    // Skip numbers already registered for this client — no duplicate patents (#3).
    const seen = new Set((await this.prisma.patent.findMany({
      where: { clientId: client.id, deletedAt: null, realNumber: { in: wanted } },
      select: { realNumber: true },
    })).map(p => p.realNumber));
    const numbers = wanted.filter(n => !seen.has(n));

    const created = [];
    for (const realNumber of numbers) {
      // Atomic per-client serial — safe if two admins register at once (see SequenceService).
      const serial = await this.sequence.allocate(patentScope(client.id));
      const handle = formatPatentHandle(client.code, serial);
      created.push(await this.prisma.patent.create({
        data: { organizationId, clientId: client.id, serial, handle, realNumber, createdBy: actorId },
        select: PATENT_OVERVIEW_SELECT,
      }));
    }
    await this.events.emit({
      action: 'patent.registered', entityType: 'PATENT', entityId: client.id,
      organizationId, metadata: { clientId: client.id, created: created.length, skippedDuplicate: numbers.length !== wanted.length, rejected: rejected.length },
    });
    return created;
  }

  /**
   * Create a patent DIRECTLY from an uploaded document (PDF/Word/media): mint the next
   * Pat_<code>_<serial> ID, store the file, and derive the real number from the file name
   * (sans extension). One patent per file.
   */
  async createFromDocument(organizationId: string, actorId: string, clientId: string, file: UploadedFileLike | undefined) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null }, select: { id: true, code: true },
    });
    if (!client) throw new NotFoundException('Client code not found.');
    // Only files NAMED like a patent number become patents — reject BEFORE storing anything,
    // so the caller can skip the bad ones and keep uploading the rest.
    const fileName = file?.originalname ?? '';
    if (!isPatentNumber(fileName)) {
      throw new BadRequestException(`"${fileName || 'file'}" is not named like a patent number — rename it to the patent number (e.g. US1234567.pdf).`);
    }
    const realNumber = normalizePatentNumber(fileName).slice(0, 100);
    const doc = await this.documents.upload(file);
    if (!doc) throw new BadRequestException('Upload failed.');
    // De-dup (#3): if this number already exists for the client, attach the new document to
    // that patent instead of creating a duplicate.
    const dup = await this.prisma.patent.findFirst({
      where: { clientId: client.id, realNumber, deletedAt: null }, select: { id: true, documentId: true },
    });
    if (dup) {
      if (dup.documentId) await this.prisma.document.update({ where: { id: dup.documentId }, data: { deletedAt: new Date() } }).catch(() => {});
      return this.prisma.patent.update({
        where: { id: dup.id }, data: { documentId: doc.id, documentName: doc.name }, select: PATENT_OVERVIEW_SELECT,
      });
    }
    const serial = await this.sequence.allocate(patentScope(client.id));
    const handle = formatPatentHandle(client.code, serial);
    return this.prisma.patent.create({
      data: {
        organizationId, clientId: client.id, serial, handle, realNumber,
        documentId: doc.id, documentName: doc.name, createdBy: actorId,
      },
      select: PATENT_OVERVIEW_SELECT,
    });
  }

  async updatePatent(organizationId: string, id: string, dto: UpdatePatentDto) {
    const patent = await this.prisma.patent.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true, clientId: true },
    });
    if (!patent) throw new NotFoundException('Patent not found.');
    // Same normalise+validate as the register/upload paths — an edit can't reintroduce a
    // divergent/garbage real number.
    const clean = this.cleanRealNumber(dto.realNumber);
    if (!clean) throw new BadRequestException(`"${dto.realNumber}" doesn't look like a patent number (e.g. US1234567).`);
    const updated = await this.prisma.patent.update({
      where: { id }, data: { realNumber: clean }, select: PATENT_OVERVIEW_SELECT,
    });
    await this.events.emit({
      action: 'patent.updated', entityType: 'PATENT', entityId: id,
      organizationId, metadata: { clientId: patent.clientId },
    });
    return updated;
  }

  async deletePatent(organizationId: string, id: string) {
    const patent = await this.prisma.patent.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true, clientId: true, documentId: true },
    });
    if (!patent) throw new NotFoundException('Patent not found.');
    const now = new Date();
    // Soft-delete the linked document TOO — otherwise the (still-live) document reverts to the
    // generic document ACL and its real-number-named PDF becomes downloadable without the passcode.
    await this.prisma.$transaction([
      this.prisma.patent.update({ where: { id }, data: { deletedAt: now } }),
      ...(patent.documentId ? [this.prisma.document.updateMany({ where: { id: patent.documentId, deletedAt: null }, data: { deletedAt: now } })] : []),
    ]);
    await this.events.emit({
      action: 'patent.deleted', entityType: 'PATENT', entityId: id,
      organizationId, metadata: { clientId: patent.clientId },
    });
    return { ok: true };
  }

  /** Attach (or replace) a PDF/media document on a patent — stored via the shared Document table. */
  async attachDocument(organizationId: string, id: string, file: UploadedFileLike | undefined) {
    const patent = await this.prisma.patent.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true, documentId: true },
    });
    if (!patent) throw new NotFoundException('Patent not found.');
    const doc = await this.documents.upload(file);
    if (!doc) throw new NotFoundException('Upload failed.');
    // Replacing an existing document → soft-delete the old blob so it stops occupying space.
    if (patent.documentId) {
      await this.prisma.document.update({ where: { id: patent.documentId }, data: { deletedAt: new Date() } }).catch(() => {});
    }
    await this.prisma.patent.update({ where: { id }, data: { documentId: doc.id, documentName: doc.name } });
    return { documentId: doc.id, documentName: doc.name };
  }

  /** The bytes of a patent's attached document (streamed by the controller, patent.manage + passcode). */
  async documentContent(organizationId: string, id: string) {
    await this.assertPasscodeConfigured(organizationId);
    const patent = await this.prisma.patent.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { documentId: true, clientId: true },
    });
    if (!patent?.documentId) throw new NotFoundException('No document attached to this patent.');
    // Trusted portal read — authorization (patent.manage + passcode + org scope) is already done;
    // the generic getContent() would self-refuse this as a patent document.
    const result = await this.documents.getContentForPatentPortal(patent.documentId);
    await this.events.emit({
      action: 'patent.document_downloaded', entityType: 'PATENT', entityId: id,
      organizationId, metadata: { clientId: patent.clientId },
    });
    return result;
  }
}
