import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  convertWorkspaceFlow, preflightWorkspaceFlow, workspaceInUse, WorkspaceFlowConversionError,
  type ConversionReport, type WorkspaceFlowName,
} from '@pdash/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { EventService } from '../audit-events/event.service';
import { WorkspaceFlowService } from './workspace-flow.service';

export const WORKSPACE_FLOW_CHANGED = 'org.workspace_flow_changed';
export const WORKSPACE_FLOW_CONVERSION_FAILED = 'org.workspace_flow_conversion_failed';

/**
 * Settings → Workspace flow: what the organisation runs, its history, and the conversion between
 * the two flows. The conversion itself lives in @pdash/db (workspace-flow-conversion.ts) so the
 * operator CLI runs exactly the same SQL; this service adds who may do it, the confirmations a
 * person has to give, the audit event, and dropping the cached flow once it has changed.
 */
@Injectable()
export class WorkspaceFlowConversionService {
  private readonly logger = new Logger(WorkspaceFlowConversionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly events: EventService,
    private readonly flows: WorkspaceFlowService,
  ) {}

  /** The current flow, when it was chosen, whether the firm is using it, and every conversion. */
  async state(organizationId: string, actorId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, code: true, workspaceFlow: true, workspaceFlowChangedAt: true, timeTrackingMode: true },
    });
    if (!org) throw new NotFoundException('Organisation not found.');
    const inUse = await workspaceInUse(this.prisma, organizationId);
    const history = await this.prisma.workspaceFlowChange.findMany({
      where: { organizationId }, orderBy: { changedAt: 'desc' }, take: 50,
    });
    const people = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(history.map(h => h.changedBy))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = new Map(people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const perms = await this.permissions.getEffectivePermissions(actorId);
    return {
      organizationId: org.id,
      name: org.name,
      flow: (org.workspaceFlow === 'CLIENTS' ? 'CLIENTS' : 'PROJECTS') as WorkspaceFlowName,
      changedAt: org.workspaceFlowChangedAt,
      timeTrackingMode: org.timeTrackingMode,
      inUse,
      canConvert: perms.isSuperAdmin,
      history: history.map(h => {
        const verification = h.verification as { ok?: boolean; invariants?: unknown[] } | null;
        const applied = h.applied as { steps?: { key: string; label: string; changed: number }[] } | null;
        return {
          id: h.id,
          fromFlow: h.fromFlow,
          toFlow: h.toFlow,
          changedAt: h.changedAt,
          changedBy: h.changedBy,
          changedByName: nameOf.get(h.changedBy) ?? h.changedBy,
          note: h.note,
          verified: verification?.ok === true,
          steps: (applied?.steps ?? []).map(s => ({ key: s.key, label: s.label, changed: s.changed })),
        };
      }),
    };
  }

  /** The dry run: exactly what converting would change, and anything that stops it. Writes nothing. */
  async preflight(organizationId: string, actorId: string, to: WorkspaceFlowName): Promise<ConversionReport> {
    await this.assertSuperAdmin(actorId);
    try {
      return await preflightWorkspaceFlow(this.prisma, { organizationId, to, actorId });
    } catch (e) {
      throw this.http(e);
    }
  }

  /**
   * Convert. Super Admin, org passcode (the guard), the organisation's name typed exactly, and a
   * backup acknowledged. One transaction; the audit event is written inside it, so the record
   * exists exactly when the change does.
   */
  async convert(
    organizationId: string, actorId: string,
    dto: { to: WorkspaceFlowName; confirm?: string; backupTaken?: boolean; note?: string },
  ): Promise<ConversionReport> {
    await this.assertSuperAdmin(actorId);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    if (!org) throw new NotFoundException('Organisation not found.');
    // Nothing to convert yet (no project, task or timesheet): choosing the flow for a new firm is
    // one confirmation — the passcode still applies. The shared conversion re-checks inside its
    // transaction and refuses if the organisation started being used in the meantime.
    const notInUse = !(await workspaceInUse(this.prisma, organizationId)).any;
    if (!notInUse && dto.backupTaken !== true) {
      throw new BadRequestException({
        statusCode: 400, code: 'BACKUP_REQUIRED',
        message: 'Take a backup of the database first, and confirm that you have (backupTaken: true).',
      });
    }
    if ((!notInUse || dto.confirm) && (dto.confirm ?? '') !== org.name) {
      throw new BadRequestException({
        statusCode: 400, code: 'CONFIRMATION_MISMATCH',
        message: 'Type the organisation’s name exactly as it is shown to confirm the conversion.',
      });
    }

    let report: ConversionReport;
    try {
      report = await convertWorkspaceFlow(this.prisma, {
        organizationId, to: dto.to, actorId, note: dto.note, notInUseShortcut: notInUse && dto.backupTaken !== true,
        auditInTx: (tx, r) => this.events.emit({
          tx,
          action: WORKSPACE_FLOW_CHANGED,
          entityType: 'ORGANIZATION',
          entityId: organizationId,
          organizationId,
          actorId,
          oldValue: { workspaceFlow: r.from },
          newValue: { workspaceFlow: r.to },
          metadata: {
            changeId: r.changeId,
            steps: r.steps.map(s => ({ key: s.key, changed: s.changed })),
            verified: r.verification.ok,
            note: dto.note ?? null,
          },
        }),
      });
    } catch (e) {
      if (e instanceof WorkspaceFlowConversionError && (e.code === 'VERIFICATION_FAILED' || e.code === 'BLOCKED')) {
        // Nothing changed — but an attempt that was refused on the data is worth a line in the log.
        await this.events.emit({
          action: WORKSPACE_FLOW_CONVERSION_FAILED,
          entityType: 'ORGANIZATION',
          entityId: organizationId,
          organizationId,
          actorId,
          metadata: {
            to: dto.to, code: e.code,
            failed: (e.blockers ?? []).map(b => b.message),
          },
        });
      }
      throw this.http(e);
    }

    // The whole app changes shape: every guard and branch must see the new flow from now on.
    this.flows.forget(organizationId);
    this.logger.log(`Organisation ${organizationId} converted ${report.from} → ${report.to} (${report.changeId}) by ${actorId}`);
    return report;
  }

  private async assertSuperAdmin(actorId: string) {
    const perms = await this.permissions.getEffectivePermissions(actorId);
    if (!perms.isSuperAdmin) {
      throw new ForbiddenException('Only a Super Admin can change the workspace flow.');
    }
  }

  /** A conversion refusal as the HTTP answer that says what happened, with the report attached. */
  private http(e: unknown): Error {
    if (!(e instanceof WorkspaceFlowConversionError)) return e as Error;
    const body = {
      code: e.code,
      message: e.message,
      ...(e.blockers ? { blockers: e.blockers } : {}),
      ...(e.report ? { report: e.report } : {}),
    };
    switch (e.code) {
      case 'NOT_FOUND': return new NotFoundException({ statusCode: 404, ...body });
      case 'BUSY_DATABASE': return new ServiceUnavailableException({ statusCode: 503, ...body });
      default: return new ConflictException({ statusCode: 409, ...body });
    }
  }
}
