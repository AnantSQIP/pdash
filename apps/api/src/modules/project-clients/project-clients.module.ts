import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { ActorContextService } from '../../common/context/actor-context.service';
import { getActorId } from '../../common/context/request-context';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

/**
 * DELIVERY CLIENTS — which company a Project ID belongs to.
 *
 * Deliberately separate from the `Client` used to mint confidential patent handles: that one is
 * about patent secrecy, this one is about who the work is for. One client holds many PIDs, so a
 * PID traces back to a client and a client traces forward to every project and status under it.
 *
 * TWO LEVELS OF VISIBILITY, enforced server-side rather than hidden in the UI:
 *   • the CODE ("MLK") is shareable — anyone who can see a project sees it;
 *   • the NAME and contact details are the client's identity and are redacted for anyone who is
 *     not a Super Admin.
 */

/** Offices that use delivery client codes. Gurgaon works this way; Jaipur uses multi-round PIDs. */
const CLIENT_CODE_OFFICES = new Set(['GURGAON']);
export const supportsClientCodes = (office?: string | null): boolean =>
  !!office && CLIENT_CODE_OFFICES.has(office);

/** A code is quoted in conversation and pasted into filenames — keep it short and unambiguous. */
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,15}$/;

export type ClientDto = {
  code?: string; name?: string; contactName?: string; contactEmail?: string;
  contactPhone?: string; address?: string; notes?: string; isActive?: boolean;
};

@Injectable()
export class ProjectClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly actor: ActorContextService,
  ) {}

  /** Managing clients is a Super Admin act — they are org-wide reference data. */
  private async assertSuperAdmin(): Promise<string> {
    const actorId = getActorId();
    if (!actorId) throw new ForbiddenException('Not authenticated.');
    const eff = await this.permissions.getEffectivePermissions(actorId);
    if (!eff.isSuperAdmin) throw new ForbiddenException('Only a Super Admin can manage clients.');
    return actorId;
  }

  /** Whether the CURRENT actor may see client names and contact details. */
  async canSeeIdentity(): Promise<boolean> {
    const actorId = getActorId();
    if (!actorId) return false;
    return (await this.permissions.getEffectivePermissions(actorId)).isSuperAdmin;
  }

  /**
   * Strip a client down to what the viewer may see. The code always survives — it is the whole
   * point of having a code — but the identity behind it does not.
   */
  redact<T extends { name?: string | null; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; address?: string | null; notes?: string | null }>(
    client: T | null, maySeeIdentity: boolean,
  ): T | null {
    if (!client) return null;
    if (maySeeIdentity) return client;
    return { ...client, name: null, contactName: null, contactEmail: null, contactPhone: null, address: null, notes: null };
  }

  private normaliseCode(raw?: string): string {
    const code = (raw ?? '').trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      throw new BadRequestException('A client code is 2–16 characters: letters, numbers, hyphen or underscore, starting with a letter or number.');
    }
    return code;
  }

  async create(dto: ClientDto) {
    const createdBy = await this.assertSuperAdmin();
    const organizationId = await this.actor.requireOrgId();
    const code = this.normaliseCode(dto.code);
    const clash = await this.prisma.projectClient.findFirst({ where: { organizationId, code } });
    if (clash) throw new BadRequestException(`Client code ${code} is already in use.`);
    return this.prisma.projectClient.create({
      data: {
        organizationId, code, createdBy,
        name: dto.name?.trim() || null,
        contactName: dto.contactName?.trim() || null,
        contactEmail: dto.contactEmail?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        address: dto.address?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(id: string, dto: ClientDto) {
    await this.assertSuperAdmin();
    const organizationId = await this.actor.requireOrgId();
    const existing = await this.prisma.projectClient.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Client not found.');
    let code = existing.code;
    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      code = this.normaliseCode(dto.code);
      const clash = await this.prisma.projectClient.findFirst({ where: { organizationId, code, id: { not: id } } });
      if (clash) throw new BadRequestException(`Client code ${code} is already in use.`);
    }
    return this.prisma.projectClient.update({
      where: { id },
      data: {
        code,
        ...(dto.name !== undefined ? { name: dto.name?.trim() || null } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName?.trim() || null } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail?.trim() || null } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone?.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: !!dto.isActive } : {}),
      },
    });
  }

  /** Soft-delete. Refused while projects still point at it — that would orphan their client. */
  async remove(id: string) {
    await this.assertSuperAdmin();
    const organizationId = await this.actor.requireOrgId();
    const client = await this.prisma.projectClient.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!client) throw new NotFoundException('Client not found.');
    const attached = await this.prisma.project.count({ where: { projectClientId: id, deletedAt: null } });
    if (attached > 0) {
      throw new BadRequestException(
        `${attached} project${attached === 1 ? '' : 's'} still belong${attached === 1 ? 's' : ''} to ${client.code}. Move them to another client first, or mark this client inactive.`,
      );
    }
    await this.prisma.projectClient.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { ok: true };
  }

  /**
   * The picker list. Everyone who can create/see projects needs the CODES to attach one, so this
   * is not Super-Admin-only — but names are redacted unless they are.
   */
  async options() {
    const organizationId = await this.actor.requireOrgId();
    const maySeeIdentity = await this.canSeeIdentity();
    const rows = await this.prisma.projectClient.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });
    return rows.map(r => ({ id: r.id, code: r.code, name: maySeeIdentity ? r.name : null }));
  }

  /**
   * THE CLIENT LEDGER — every client with the PIDs underneath it and where each one stands.
   *
   * The mirror image of the PID ledger: that answers "what is this number", this answers "what do
   * we have for this client". Each PID carries enough to jump straight to it in the PID ledger.
   */
  async ledger() {
    const organizationId = await this.actor.requireOrgId();
    const maySeeIdentity = await this.canSeeIdentity();
    const clients = await this.prisma.projectClient.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
    const projects = await this.prisma.project.findMany({
      where: { projectClientId: { in: clients.map(c => c.id) }, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true, code: true, roundSeq: true, title: true, projectType: true, projectPhase: true,
        priority: true, completionPercentage: true, startDate: true, dueDate: true,
        completedAt: true, closedAt: true, clientDeliveryDate: true,
        workingHours: true, actualHours: true, office: true, projectClientId: true,
        _count: { select: { projectTasks: { where: { task: { deletedAt: null } } }, members: { where: { isActive: true } } } },
      },
    });
    const logged = projects.length
      ? await this.prisma.timesheet.groupBy({
          by: ['projectId'], where: { projectId: { in: projects.map(p => p.id) }, deletedAt: null },
          _sum: { hoursLogged: true },
        })
      : [];
    const loggedById = new Map(logged.map(l => [l.projectId, Math.round((l._sum.hoursLogged ?? 0) * 10) / 10]));

    const byClient = new Map<string, typeof projects>();
    for (const p of projects) {
      if (!p.projectClientId) continue;
      const list = byClient.get(p.projectClientId) ?? [];
      list.push(p);
      byClient.set(p.projectClientId, list);
    }
    const LIVE = ['ACTIVE', 'PLANNING', 'ON_HOLD'];

    return clients.map(c => {
      const own = byClient.get(c.id) ?? [];
      // One row per PID, not per project — a Jaipur PID can hold several rounds.
      const pidMap = new Map<string, typeof own>();
      for (const p of own) {
        const key = p.code ?? `(pending):${p.id}`;
        (pidMap.get(key) ?? pidMap.set(key, []).get(key)!).push(p);
      }
      const pids = [...pidMap].map(([pid, rounds]) => ({
        pid: pid.startsWith('(pending):') ? null : pid,
        projectId: rounds[0].id,
        rounds: rounds.length,
        title: rounds[rounds.length - 1].title,
        type: rounds[rounds.length - 1].projectType ?? null,
        office: rounds[rounds.length - 1].office ?? null,
        // The PID is live if ANY project under it is.
        status: rounds.some(r => LIVE.includes(r.projectPhase))
          ? 'WORKING'
          : rounds.some(r => r.projectPhase === 'COMPLETED') ? 'COMPLETED'
          : rounds.some(r => r.projectPhase === 'CLOSED') ? 'CLOSED' : 'DISCONTINUED',
        progress: Math.round(rounds.reduce((n, r) => n + r.completionPercentage, 0) / rounds.length),
        tasks: rounds.reduce((n, r) => n + r._count.projectTasks, 0),
        loggedHours: Math.round(rounds.reduce((n, r) => n + (loggedById.get(r.id) ?? 0), 0) * 10) / 10,
        startDate: rounds[0].startDate,
        dueDate: rounds[rounds.length - 1].dueDate,
        clientDeliveryDate: rounds[rounds.length - 1].clientDeliveryDate,
      }));
      const shaped = this.redact(c, maySeeIdentity)!;
      return {
        id: c.id, code: c.code, isActive: c.isActive,
        name: shaped.name, contactName: shaped.contactName, contactEmail: shaped.contactEmail,
        contactPhone: shaped.contactPhone, address: shaped.address, notes: shaped.notes,
        createdAt: c.createdAt,
        pids,
        projectCount: own.length,
        pidCount: pids.length,
        liveCount: pids.filter(p => p.status === 'WORKING').length,
        totalLoggedHours: Math.round(pids.reduce((n, p) => n + p.loggedHours, 0) * 10) / 10,
      };
    });
  }

  /**
   * Match-or-create a delivery client by CODE.
   *
   * Used when a patent is linked to a project: the patent side derives its own confidential
   * client, and this keeps the delivery side in step so the same company never ends up recorded
   * under two different codes — the one real risk of keeping the two concepts separate.
   */
  async ensureByCode(organizationId: string, code: string, name: string | null, createdBy: string) {
    const normalised = (code ?? '').trim().toUpperCase();
    if (!normalised) return null;
    const existing = await this.prisma.projectClient.findFirst({ where: { organizationId, code: normalised } });
    if (existing) return existing;
    return this.prisma.projectClient.create({
      data: { organizationId, code: normalised, name: name ?? null, createdBy },
    }).catch(() => this.prisma.projectClient.findFirst({ where: { organizationId, code: normalised } }));
  }
}

@Controller('project-clients')
class ProjectClientsController {
  constructor(private readonly svc: ProjectClientsService) {}

  /** Codes for the picker — visible to anyone who can create a project; names redacted. */
  @Get('options') @RequirePermission('project.view')
  options() { return this.svc.options(); }

  /** The client ledger: clients, their PIDs and where each stands. */
  @Get('ledger') @RequirePermission('project.view')
  ledger() { return this.svc.ledger(); }

  @Post() create(@Body() body: ClientDto) { return this.svc.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: ClientDto) { return this.svc.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [PermissionsModule],
  providers: [ProjectClientsService],
  controllers: [ProjectClientsController],
  exports: [ProjectClientsService],
})
export class ProjectClientsModule {}
