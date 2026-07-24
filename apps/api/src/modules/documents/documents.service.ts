import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EventService } from '../audit-events/event.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EVENTS } from '../../common/events/canonical-events';
import { getActorId } from '../../common/context/request-context';
import { documentStorage } from './document-storage';

/** Per-file upload cap. Multer enforces it at the transport layer too. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
/** Max attachments per message/comment. */
export const MAX_ATTACHMENTS = 10;

/** Shape multer produces with memory storage (typed locally — no @types/multer dep). */
export interface UploadedFileLike {
  originalname?: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

/** The document projection every attachment/list response uses. */
export const DOC_SELECT = {
  id: true,
  name: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  uploadedBy: true,
  createdAt: true,
} as const;

const UPLOADER_SELECT = { id: true, firstName: true, lastName: true, profilePhoto: true } as const;

/** MIME types the content endpoint serves inline; everything else downloads as an
 *  attachment (octet-stream) so an uploaded HTML/SVG can never run in the app origin. */
const SAFE_INLINE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf',
]);
export function isInlineSafe(mime: string | null | undefined): boolean {
  return !!mime && SAFE_INLINE_MIME.has(mime);
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly permissions: PermissionService,
    private readonly access: ProjectAccessService,
  ) {}

  private actor(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  /**
   * Store an uploaded file (metadata row + blob row). Optionally link it to a
   * project ("Files" tab direct upload) or a task. Attachments destined for a
   * message/comment are uploaded WITHOUT context and linked when the message or
   * comment is created — an abandoned composer upload therefore never surfaces
   * anywhere (it stays an unattached, invisible row).
   */
  async upload(file: UploadedFileLike | undefined, opts: { projectId?: string; taskId?: string } = {}) {
    const actorId = this.actor();
    if (!file || !file.buffer?.length) throw new BadRequestException('No file provided.');
    if (file.size > MAX_FILE_BYTES || file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('File too large (max 20 MB).');
    }
    // Keep just the basename — some browsers send paths — and cap the length.
    const rawName = (file.originalname ?? 'file').split(/[\\/]/).pop() || 'file';
    const name = rawName.slice(0, 180);
    const mimeType = (file.mimetype || 'application/octet-stream').slice(0, 100);

    const projectId = opts.projectId?.trim() || undefined;
    const taskId = opts.taskId?.trim() || undefined;
    if (projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
      if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } });
      if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    }

    const id = randomUUID();
    // Store the bytes via the configured driver (local disk on Contabo, S3 on AWS) to keep large
    // files OUT of the database. If it couldn't be written, fall back to a DB blob so an upload
    // never fails outright.
    const storagePath = await documentStorage.put(id, file.buffer);

    await this.prisma.$transaction([
      this.prisma.document.create({
        data: {
          id,
          name,
          mimeType,
          fileSize: file.buffer.length,
          fileUrl: `/api/v1/documents/${id}/content`,
          uploadedBy: actorId,
          storagePath,
          ...(storagePath ? {} : { blob: { create: { data: file.buffer } } }),
        },
      }),
      ...(projectId ? [this.prisma.projectDocument.create({ data: { projectId, documentId: id } })] : []),
      ...(taskId ? [this.prisma.taskDocument.create({ data: { taskId, documentId: id } })] : []),
    ]);

    await this.events.emit({
      action: EVENTS.DOCUMENT_UPLOADED,
      entityType: 'DOCUMENT',
      entityId: id,
      // The filename is NOT logged — a patent document's filename is its confidential real
      // number, and the activity feed must never carry it. Keep only non-sensitive metadata.
      metadata: { projectId, taskId, size: file.buffer.length, mimeType },
    });
    return this.prisma.document.findUnique({ where: { id }, select: DOC_SELECT });
  }

  /**
   * Validate that the actor may attach these documents to a message/comment:
   * they uploaded them, they are not deleted, and they are not attached to
   * anything else yet (prevents re-attaching someone else's / another thread's file).
   */
  async assertAttachable(documentIds: string[], actorId: string): Promise<string[]> {
    const ids = [...new Set(documentIds)].filter(Boolean);
    if (!ids.length) return [];
    if (ids.length > MAX_ATTACHMENTS) throw new BadRequestException(`At most ${MAX_ATTACHMENTS} attachments are allowed.`);
    const docs = await this.prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        uploadedBy: true,
        _count: { select: { messageAttachments: true, commentAttachments: true } },
      },
    });
    if (docs.length !== ids.length) throw new BadRequestException('One or more attachments were not found.');
    for (const d of docs) {
      if (d.uploadedBy !== actorId) throw new ForbiddenException('You can only attach files you uploaded.');
      if (d._count.messageAttachments + d._count.commentAttachments > 0) {
        throw new BadRequestException('A file is already attached to another message.');
      }
    }
    return ids;
  }

  /**
   * Fetch a document's bytes for streaming, AUTHORISED by whatever the document is linked to.
   * A document is confidential to the same people who can see the thing it belongs to — a
   * project file to that project's members, a comment attachment to that matter's members, a
   * channel attachment to the channel's members, an expense receipt to org expense reviewers.
   * Patent documents are served ONLY through the passcode-gated patents route, never here.
   * (Previously this only member-gated channel attachments, so every other document — patent
   * PDFs, receipts, comment/project files — was downloadable by any authenticated user.)
   */
  async getContent(id: string) {
    const actorId = this.actor();
    const doc = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...DOC_SELECT,
        storagePath: true,
        blob: { select: { data: true } },
        messageAttachments: { select: { message: { select: { channelId: true } } } },
        commentAttachments: { select: { comment: { select: { entityType: true, entityId: true } } } },
        projectDocuments: { select: { projectId: true } },
        taskDocuments: { select: { taskId: true } },
        policies: { select: { id: true }, take: 1 },
      },
    });
    if (!doc || (!doc.storagePath && !doc.blob)) throw new NotFoundException(`Document ${id} not found`);

    await this.assertMayRead(actorId, id, doc);

    const { blob, storagePath, messageAttachments, commentAttachments, projectDocuments, taskDocuments, policies, ...meta } = doc;
    const data = storagePath ? await documentStorage.get(storagePath) : blob!.data;
    return { doc: meta, data };
  }

  /** Authorize a document read via any of its links; deny if none grant access. */
  private async assertMayRead(
    actorId: string,
    documentId: string,
    doc: {
      uploadedBy: string;
      messageAttachments: { message: { channelId: string } }[];
      commentAttachments: { comment: { entityType: string; entityId: string } }[];
      projectDocuments: { projectId: string }[];
      taskDocuments: { taskId: string }[];
      policies: { id: string }[];
    },
  ): Promise<void> {
    // Patent documents are the crown jewels — the generic route never serves them; they must
    // go through the passcode-gated /patents/:id/document/content.
    const patent = await this.prisma.patent.findFirst({ where: { documentId, deletedAt: null }, select: { id: true } });
    if (patent) throw new ForbiddenException('This document is only available through the confidential patents portal.');

    // The uploader may always read their own file (covers abandoned/unattached uploads and an
    // expense receipt, whose claimant IS the uploader).
    if (doc.uploadedBy === actorId) return;

    // Channel attachment → channel member.
    const channelIds = [...new Set(doc.messageAttachments.map(a => a.message.channelId))];
    if (channelIds.length) {
      const member = await this.prisma.channelMember.findFirst({
        where: { channelId: { in: channelIds }, userId: actorId }, select: { id: true },
      });
      if (member) return;
    }
    // Project file → project member/lead.
    for (const pd of doc.projectDocuments) {
      if (await this.access.canAccessProject(actorId, pd.projectId)) return;
    }
    // Task file → the task's project.
    for (const td of doc.taskDocuments) {
      if (await this.access.canAccessTask(actorId, td.taskId)) return;
    }
    // Comment attachment → the comment's underlying matter.
    for (const ca of doc.commentAttachments) {
      if (await this.access.canAccessEntity(actorId, ca.comment.entityType, ca.comment.entityId)) return;
    }
    // Expense receipt → an org expense reviewer (the claimant is covered by the uploader check).
    const receipt = await this.prisma.expense.findFirst({ where: { receiptDocumentId: documentId }, select: { id: true } });
    if (receipt && (await this.permissions.check(actorId, 'expense.view.organization'))) return;
    // Published HR policy attachment → readable by everyone in the org.
    if (doc.policies.length) return;

    throw new ForbiddenException('You do not have access to this document.');
  }

  /**
   * All files that belong to a project — the "Files" tab:
   *   • directly uploaded to the project (ProjectDocument)
   *   • attached to any of the project's tasks (TaskDocument via ProjectTask)
   * Files that arrived as discussion attachments carry source 'discussion'.
   */
  async listForProject(projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const docSelect = { ...DOC_SELECT, _count: { select: { commentAttachments: true } } } as const;
    const [projLinks, taskLinks] = await Promise.all([
      this.prisma.projectDocument.findMany({
        where: { projectId, document: { deletedAt: null } },
        select: { document: { select: docSelect } },
      }),
      this.prisma.taskDocument.findMany({
        where: {
          document: { deletedAt: null },
          task: { deletedAt: null, projectTasks: { some: { projectId } } },
        },
        select: { document: { select: docSelect }, task: { select: { id: true, title: true } } },
      }),
    ]);

    type Row = {
      id: string; name: string; mimeType: string | null; fileSize: number | null; fileUrl: string;
      uploadedBy: string; createdAt: Date; source: 'direct' | 'task' | 'discussion';
      task: { id: string; title: string } | null;
      _count?: { commentAttachments: number };
    };
    const byId = new Map<string, Row>();
    for (const l of taskLinks) {
      const d = l.document;
      byId.set(d.id, { ...d, source: d._count.commentAttachments > 0 ? 'discussion' : 'task', task: l.task });
    }
    for (const l of projLinks) {
      const d = l.document;
      if (!byId.has(d.id)) {
        byId.set(d.id, { ...d, source: d._count.commentAttachments > 0 ? 'discussion' : 'direct', task: null });
      }
    }

    const rows = [...byId.values()];
    const uploaderIds = [...new Set(rows.map(r => r.uploadedBy))];
    const uploaders = uploaderIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: UPLOADER_SELECT })
      : [];
    const uploaderById = new Map(uploaders.map(u => [u.id, u]));

    return rows
      .map(({ _count, ...r }) => ({ ...r, uploader: uploaderById.get(r.uploadedBy) ?? null }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Soft-delete a document. Allowed for the uploader, or anyone holding
   * document.delete. The metadata row stays (audit/history); the blob is freed.
   */
  async softDelete(id: string) {
    const actorId = this.actor();
    const doc = await this.prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    if (doc.uploadedBy !== actorId) {
      const allowed = await this.permissions.check(actorId, 'document.delete');
      if (!allowed) throw new ForbiddenException('You can only delete files you uploaded.');
    }
    await this.prisma.$transaction([
      this.prisma.document.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.documentBlob.deleteMany({ where: { documentId: id } }),
    ]);
    // Free the stored bytes too (disk or S3).
    if (doc.storagePath) await documentStorage.delete(doc.storagePath);
    await this.events.emit({
      action: EVENTS.DOCUMENT_DELETED,
      entityType: 'DOCUMENT',
      entityId: id,
      // Filename intentionally not logged (may be a confidential patent number).
      metadata: {},
    });
    return { ok: true };
  }

  /** Internal: soft-delete a batch (used when a message/comment is deleted). No permission check — callers already own the parent. */
  async softDeleteAttached(documentIds: string[]): Promise<void> {
    const ids = [...new Set(documentIds)].filter(Boolean);
    if (!ids.length) return;
    await this.prisma.$transaction([
      this.prisma.document.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } }),
      this.prisma.documentBlob.deleteMany({ where: { documentId: { in: ids } } }),
    ]);
  }
}
