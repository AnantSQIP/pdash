import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { formatPatentHandle, patentScope } from '../../common/financial-year';
import { CreateClientDto, RegisterPatentsDto, UpdatePatentDto } from './dto';
import { DocumentsService, type UploadedFileLike } from '../documents/documents.service';

// ── Default-DENY selects ────────────────────────────────────────────────────
// The confidential `realNumber` is NEVER put in the OVERVIEW select — only the passcode-gated
// `revealPatents` uses FULL_SELECT. So even a super admin never receives real numbers without
// clearing the org passcode.
const PATENT_OVERVIEW_SELECT = { id: true, handle: true, serial: true, clientId: true, documentId: true, documentName: true } as const;
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
  ) {}

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
    await this.prisma.$transaction([
      this.prisma.patent.updateMany({ where: { clientId: id, deletedAt: null }, data: { deletedAt: now } }),
      this.prisma.client.update({ where: { id }, data: { deletedAt: now } }),
    ]);
    return { ok: true };
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
  revealPatents(organizationId: string, clientId?: string) {
    return this.prisma.patent.findMany({
      where: { organizationId, deletedAt: null, ...(clientId ? { clientId } : {}) },
      select: { ...PATENT_FULL_SELECT, client: { select: CLIENT_MINI } },
      orderBy: [{ clientId: 'asc' }, { serial: 'asc' }],
    });
  }

  /** Handle-only options for the project picker (patent.view). All clients when clientId omitted. */
  patentOptions(organizationId: string, clientId?: string) {
    return this.prisma.patent.findMany({
      where: { organizationId, deletedAt: null, ...(clientId ? { clientId } : {}) },
      select: PATENT_OVERVIEW_SELECT,
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

    const numbers = dto.realNumbers.map(n => n.trim()).filter(Boolean);
    if (!numbers.length) throw new BadRequestException('Provide at least one patent number.');

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
    const doc = await this.documents.upload(file);
    if (!doc) throw new BadRequestException('Upload failed.');
    const serial = await this.sequence.allocate(patentScope(client.id));
    const handle = formatPatentHandle(client.code, serial);
    const realNumber = ((doc.name || '').replace(/\.[^.]+$/, '').trim() || doc.name || 'document').slice(0, 100);
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
      where: { id, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!patent) throw new NotFoundException('Patent not found.');
    return this.prisma.patent.update({
      where: { id }, data: { realNumber: dto.realNumber }, select: PATENT_OVERVIEW_SELECT,
    });
  }

  async deletePatent(organizationId: string, id: string) {
    const patent = await this.prisma.patent.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { id: true },
    });
    if (!patent) throw new NotFoundException('Patent not found.');
    await this.prisma.patent.update({ where: { id }, data: { deletedAt: new Date() } });
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

  /** The bytes of a patent's attached document (streamed by the controller, patent.manage only). */
  async documentContent(organizationId: string, id: string) {
    const patent = await this.prisma.patent.findFirst({
      where: { id, organizationId, deletedAt: null }, select: { documentId: true },
    });
    if (!patent?.documentId) throw new NotFoundException('No document attached to this patent.');
    return this.documents.getContent(patent.documentId);
  }
}
