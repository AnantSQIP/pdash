import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { EventService } from '../audit-events/event.service';
import { formatPatentHandle, patentScope } from '../../common/financial-year';
import {
  suggestClientCode, validateClientCode, findSimilarClients, CLIENT_CODE_MIN, CLIENT_CODE_MAX,
} from '../../common/client-code';
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
const PATENT_OVERVIEW_SELECT = {
  id: true, handle: true, serial: true, clientId: true, documentId: true, formerHandles: true,
} as const;
const PATENT_FULL_SELECT = {
  id: true, handle: true, serial: true, clientId: true, realNumber: true, createdAt: true,
  documentId: true, documentName: true, formerHandles: true,
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

  /**
   * Turn a rule violation into something a person can act on. The rule itself lives in
   * client-code.ts; only the wording lives here.
   */
  private async assertCodeUsable(organizationId: string, code: string, exceptClientId?: string) {
    const taken = (await this.prisma.client.findMany({
      where: { organizationId, deletedAt: null, ...(exceptClientId ? { id: { not: exceptClientId } } : {}) },
      select: { code: true },
    })).map(c => c.code);
    const problem = validateClientCode(code, taken);
    if (!problem) {
      await this.assertCodeNotRetired(organizationId, code, exceptClientId);
      return;
    }
    const said: Record<string, string> = {
      empty: 'A client code is required.',
      too_short: `A client code needs at least ${CLIENT_CODE_MIN} characters.`,
      too_long: `A client code can be at most ${CLIENT_CODE_MAX} characters — it appears in every patent ID.`,
      charset: 'A client code is letters and digits only, and must contain at least one letter.',
      reserved: `"${code}" is reserved by the system — please choose another.`,
      taken: `Client code "${code}" is already in use.`,
    };
    throw new BadRequestException(said[problem] ?? 'That client code cannot be used.');
  }

  /**
   * A code that patent IDs were once issued under can never be handed to a different client.
   *
   * Rename client MLK and "MLK" looks free — but Pat_MLK_001 is on a report we sent, and if a new
   * client takes the code and mints its own Pat_MLK_001, that ID now means two different clients'
   * patents at once. No lookup can undo that, and the two clients are exactly the parties who
   * must never be confused with each other.
   *
   * Only bites when IDs were actually issued: a code typed by mistake and corrected before any
   * patent existed leaves no retired handles, so it stays reusable.
   */
  private async assertCodeNotRetired(organizationId: string, code: string, exceptClientId?: string) {
    const prefix = `${formatPatentHandle(code, 0).slice(0, -3)}`; // "Pat_<code>_"
    // starts_with(), NOT LIKE. A handle prefix is full of underscores, and `_` is a
    // single-character wildcard in LIKE — so `LIKE 'Pat_MLK_%'` also matches "Pat_MLKZ_001",
    // and retiring the code MLKZ would have refused the perfectly legitimate, unrelated code
    // MLK with a message claiming its IDs were already issued. starts_with has no pattern
    // language at all, which is exactly what a prefix test wants.
    const rows = await this.prisma.$queryRaw<{ handle: string; clientId: string }[]>`
      SELECT p."handle", p."clientId"
      FROM "patent" p
      WHERE p."organizationId" = ${organizationId}
        AND p."deletedAt" IS NULL
        ${exceptClientId ? Prisma.sql`AND p."clientId" <> ${exceptClientId}` : Prisma.empty}
        AND EXISTS (
          SELECT 1 FROM unnest(p."formerHandles") AS h
          WHERE starts_with(h, ${prefix})
        )
      LIMIT 1
    `;
    if (rows.length) {
      throw new BadRequestException(
        `Patent IDs were already issued under "${code}" for another client. Reusing it would make those IDs ambiguous — please choose a different code.`,
      );
    }
  }

  /**
   * Propose a code for a client name, and flag clients that look like the same company.
   * Advisory only — the caller may ignore both. The duplicate warning is the point: two codes
   * for one company splits its patent portfolio in two, and nothing downstream detects that.
   */
  async suggestCode(organizationId: string, name: string) {
    const clients = await this.prisma.client.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, code: true },
    });
    return {
      code: suggestClientCode(name, clients.map(c => c.code)),
      similar: findSimilarClients(name, clients),
    };
  }

  // ── Client codes (patent.manage) ──────────────────────────────────────────
  async listClients(organizationId: string) {
    const clients = await this.prisma.client.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true, name: true, code: true, archivedAt: true,
        _count: { select: { patents: { where: { deletedAt: null } }, projects: { where: { deletedAt: null } } } },
      },
      // Archived codes sink to the bottom; within each group, alphabetical. The portal is a
      // working list, and a retired client should not sit between two live ones.
      orderBy: [{ archivedAt: 'asc' }, { code: 'asc' }],
    });
    if (!clients.length) return [];
    // How much work is STILL RUNNING for each client — a separate query because `_count` cannot
    // count the same relation twice under different conditions. This is what makes archiving an
    // informed decision instead of a silent one: retiring a client with three live matters is
    // occasionally right and usually a mistake, and only the person clicking can tell which.
    const live = await this.prisma.project.groupBy({
      by: ['clientId'],
      where: {
        clientId: { in: clients.map(c => c.id) }, deletedAt: null,
        projectPhase: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] },
      },
      _count: { _all: true },
    });
    const activeByClient = new Map(live.map(r => [r.clientId!, r._count._all]));
    return clients.map(c => ({ ...c, activeProjects: activeByClient.get(c.id) ?? 0 }));
  }

  async createClient(organizationId: string, actorId: string, dto: CreateClientDto) {
    await this.assertCodeUsable(organizationId, dto.code);
    return this.prisma.client.create({
      data: { organizationId, name: dto.name ?? null, code: dto.code, createdBy: actorId },
      select: { id: true, name: true, code: true, archivedAt: true },
    });
  }

  /**
   * Load a live client, or say why not. Every client-scoped write goes through here so a
   * deleted-or-missing id can't reach the mutation below it.
   */
  private async requireClient(organizationId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, code: true, name: true, archivedAt: true },
    });
    if (!client) throw new NotFoundException('Client code not found.');
    return client;
  }

  /**
   * An archived client is retired, not gone: nothing new attaches to it. Registering a patent
   * under one is almost always someone picking a stale entry from a list, so it is refused with
   * the way out rather than silently accepted.
   */
  private assertNotArchived(client: { code: string; archivedAt: Date | null }) {
    if (client.archivedAt) {
      throw new BadRequestException(`Client ${client.code} is archived — restore it before adding patents.`);
    }
  }

  /**
   * ARCHIVE — reversible, no passcode, nothing destroyed. The client drops out of the project
   * patent picker and stops accepting new patents; everything already recorded stays untouched.
   */
  async setClientArchived(organizationId: string, actorId: string, id: string, archived: boolean) {
    const client = await this.requireClient(organizationId, id);
    if (!!client.archivedAt === archived) return { ...client, archivedAt: client.archivedAt };
    const updated = await this.prisma.client.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      select: { id: true, name: true, code: true, archivedAt: true },
    });
    await this.events.emit({
      action: archived ? 'patent.client_archived' : 'patent.client_restored',
      entityType: 'CLIENT', entityId: id, organizationId, metadata: { code: client.code, actorId },
    });
    return updated;
  }

  /**
   * REMOVE — a real delete, and the only irreversible action on this screen.
   *
   * It is refused while anything still points at the client. That is not caution for its own
   * sake: `Patent.clientId` cascades, so deleting a client with patents destroys the patent rows
   * and their documents outright, and `Project.clientId` is SetNull, so it would quietly strip
   * the client off historic projects. Archive covers the case people actually mean; Remove exists
   * for the code typed by mistake five minutes ago.
   */
  async deleteClient(organizationId: string, id: string) {
    const client = await this.requireClient(organizationId, id);
    // Count EVERY patent row, including soft-deleted ones — the cascade does not respect
    // deletedAt, so a "removed" patent is destroyed just the same.
    const [patents, projects] = await Promise.all([
      this.prisma.patent.count({ where: { clientId: id } }),
      this.prisma.project.count({ where: { clientId: id } }),
    ]);
    if (patents || projects) {
      const held = [
        patents ? `${patents} patent${patents === 1 ? '' : 's'}` : '',
        projects ? `${projects} project${projects === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' and ');
      throw new BadRequestException(
        `${client.code} still has ${held} — removing it would destroy those records. Archive it instead.`,
      );
    }
    await this.prisma.client.delete({ where: { id } });
    await this.events.emit({
      action: 'patent.client_deleted', entityType: 'CLIENT', entityId: id, organizationId,
      metadata: { code: client.code, name: client.name },
    });
    return { ok: true };
  }

  /**
   * Edit a client code / name (#A: fix a typo without delete+recreate). Renaming the CODE
   * re-mints every non-deleted patent's handle to Pat_<newcode>_<serial> so nothing is left
   * inconsistent, and is blocked if the new code is already used by another live client.
   */
  async updateClient(organizationId: string, id: string, dto: UpdateClientDto) {
    const client = await this.requireClient(organizationId, id);

    const data: { name?: string | null; code?: string } = {};
    if (dto.name !== undefined) data.name = dto.name || null;
    const newCode = dto.code && dto.code !== client.code ? dto.code : null;
    if (newCode) {
      await this.assertCodeUsable(organizationId, newCode, id);
      data.code = newCode;
    }
    if (!Object.keys(data).length) {
      return this.prisma.client.findUnique({ where: { id }, select: { id: true, name: true, code: true, archivedAt: true } });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data });
      if (newCode) {
        const patents = await tx.patent.findMany({
          where: { clientId: id, deletedAt: null }, select: { id: true, serial: true, handle: true, formerHandles: true },
        });
        for (const p of patents) {
          const next = formatPatentHandle(newCode, p.serial);
          if (next === p.handle) continue;
          // Keep the ID we already gave the client. Renaming back and forth (MLK → MLKB → MLK)
          // must not leave the live handle sitting in its own history, and must not stack up
          // duplicates — so the list is rebuilt from the set rather than blindly appended to.
          const former = [...p.formerHandles.filter(h => h !== p.handle && h !== next), p.handle];
          await tx.patent.update({
            where: { id: p.id },
            data: { handle: next, formerHandles: [...new Set(former)].filter(h => h !== next) },
          });
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
    return this.prisma.client.findUnique({ where: { id }, select: { id: true, name: true, code: true, archivedAt: true } });
  }

  // ── Patents ───────────────────────────────────────────────────────────────
  /**
   * OVERVIEW — patent IDs (handles) + serials, NO real numbers. patent.manage, no passcode.
   *
   * Each patent carries the WORK DONE ON IT: the PIDs it is tagged to, with their phase. Without
   * it the portal answers "which patents exist" and not "what have we done about this one", which
   * is the question somebody actually arrives with — and it left 30 of 33 patents here looking
   * identical whether they had a year of work behind them or none at all.
   *
   * Only the project's code, title and phase travel: the handle→PID link is exactly what this
   * screen is for, and neither carries a real patent number.
   */
  async listPatents(organizationId: string, clientId?: string) {
    const rows = await this.prisma.patent.findMany({
      where: { organizationId, deletedAt: null, ...(clientId ? { clientId } : {}) },
      select: {
        ...PATENT_OVERVIEW_SELECT,
        client: { select: CLIENT_MINI },
        projectLinks: {
          select: {
            project: {
              select: {
                id: true, code: true, roundSeq: true, title: true,
                projectPhase: true, completedAt: true, deletedAt: true,
              },
            },
          },
        },
      },
      orderBy: [{ clientId: 'asc' }, { serial: 'asc' }],
    });
    return rows.map(({ projectLinks, ...p }) => {
      const projects = projectLinks
        .map(l => l.project)
        .filter(pr => pr && !pr.deletedAt)
        .map(({ deletedAt, ...pr }) => pr)
        .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '') || a.roundSeq - b.roundSeq);
      return {
        ...p,
        projects,
        /** Minted but never tagged to any work — the patent equivalent of an unused reservation. */
        unused: projects.length === 0,
      };
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
   *  user can't correlate a handle to its client or to the real number embedded in the filename.
   *
   *  Patents under an ARCHIVED client are omitted: this list is what people tag NEW work with,
   *  and a retired client should stop appearing there. Links that already exist are untouched. */
  patentOptions(organizationId: string, clientId?: string) {
    return this.prisma.patent.findMany({
      where: {
        organizationId, deletedAt: null, ...(clientId ? { clientId } : {}),
        client: { archivedAt: null, deletedAt: null },
      },
      // formerHandles is included so the picker's search box still finds a patent by the ID it
      // used to have. It gives nothing away that the live handle doesn't: an old handle contains
      // an old CLIENT CODE, and the current one is right there in `handle` already.
      select: { id: true, handle: true, serial: true, formerHandles: true },
      orderBy: [{ clientId: 'asc' }, { serial: 'asc' }],
    });
  }

  /**
   * Resolve a patent ID that may be out of date — the ID a client quotes back from an email we
   * sent them last year, before their code was renamed.
   *
   * Returns the CURRENT handle and says whether the one asked for is still live. Handles only:
   * no client, no real number, no document — this answers "what is this ID now", which is the
   * question, and nothing more.
   */
  async resolveHandle(organizationId: string, raw: string) {
    const handle = (raw ?? '').trim();
    if (!handle) throw new BadRequestException('Provide a patent ID to look up.');

    // A LIVE handle always wins over a retired one, and the two really can be the same string:
    // rename client MLK to something else and "MLK" becomes free, so a different client can take
    // it and mint Pat_MLK_001 for real — the exact ID the first client's patent used to carry.
    // Asking the database for both at once with a single OR leaves the winner to whichever row
    // the planner happens to reach first, which could answer a question about one client with a
    // patent belonging to another. Two ordered queries make the precedence explicit.
    const select = { id: true, handle: true, serial: true, formerHandles: true, clientId: true } as const;
    const live = await this.prisma.patent.findFirst({
      where: { organizationId, deletedAt: null, handle }, select,
    });
    const patent = live ?? await this.prisma.patent.findFirst({
      where: { organizationId, deletedAt: null, formerHandles: { has: handle } },
      // Oldest first, so a string that has been retired more than once resolves to the patent
      // that carried it first rather than to an arbitrary one.
      orderBy: { createdAt: 'asc' }, select,
    });
    if (!patent) throw new NotFoundException(`No patent has ever been identified as "${handle}".`);

    // When a live patent answers, another patent may STILL have carried this ID before. Saying so
    // is the difference between a useful answer and a quietly wrong one.
    const alsoRetired = live
      ? await this.prisma.patent.count({
          where: { organizationId, deletedAt: null, formerHandles: { has: handle }, id: { not: live.id } },
        })
      : 0;

    return {
      id: patent.id, handle: patent.handle, serial: patent.serial, formerHandles: patent.formerHandles,
      // False = the caller quoted a retired ID. The UI says so rather than silently swapping in
      // the new one, because "that ID changed" is the useful half of the answer.
      current: patent.handle === handle,
      /** This ID is live for one patent AND retired from another — it is genuinely ambiguous. */
      ambiguous: alsoRetired > 0,
      searchedFor: handle,
    };
  }

  /** Register one or more real patent numbers under a client, minting Pat_<code>_<serial>. */
  async registerPatents(organizationId: string, actorId: string, dto: RegisterPatentsDto) {
    const client = await this.requireClient(organizationId, dto.clientId);
    this.assertNotArchived(client);

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
    const client = await this.requireClient(organizationId, clientId);
    this.assertNotArchived(client);
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
