import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EventService } from '../audit-events/event.service';
import { getActorId } from '../../common/context/request-context';

/**
 * Who may see a real patent number, and on what grounds.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Patents are shown throughout the system as handles — `Pat_ABC_001` — and the real number was
 * readable only by a Super Admin holding the organisation passcode. That protects client identity,
 * and it also made the work impossible: an analyst staffed on a prior-art search could see that
 * their task concerned `Pat_ABC_001` and had no way to find out WHICH PATENT that was. The person
 * doing the searching could not see the thing they were searching for.
 *
 * THE RULE: ACCESS FOLLOWS THE WORK
 *
 * Three tiers, and each answers a different question.
 *
 *   1. HANDLE ONLY — anyone with `patent.view`.
 *      Answers "which patents exist" for pickers and task titles. No number, no client.
 *
 *   2. HANDLE ↔ REAL NUMBER — members of a project the patent is tagged to.
 *      Answers "what am I actually working on". Scoped to THAT project's patents: being staffed
 *      on one matter reveals nothing about any other. No client identity — see below.
 *
 *   3. EVERYTHING — `patent.manage`, plus the passcode for a bulk reveal.
 *      Answers "what does this client's portfolio look like", which is a different question and
 *      stays with the people who own client relationships.
 *
 * WHY TIER 2 STOPS SHORT OF THE CLIENT
 *
 * Knowing a patent number is what the work requires. Knowing WHOSE it is, is commercial
 * information and a separate thing — an analyst can search a patent perfectly well without being
 * told which client is paying. Keeping the two apart means the concealment still does its job for
 * everyone except the handful of people who need the commercial view.
 *
 * WHAT THIS DOES NOT FIX
 *
 * A handle contains the client CODE, and codes were historically derived from the client's name
 * (Mailike → MLK). Anyone who learns one pairing can read it on every handle thereafter. New
 * codes are opaque (see client-code.ts) but existing ones are not, so tier 2 leaks slightly more
 * than it looks for clients onboarded before that change. Access control is the real boundary
 * here; the handle was never more than a speed bump.
 */
@Injectable()
export class PatentVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly access: ProjectAccessService,
    private readonly events: EventService,
  ) {}

  private actorId(): string {
    const id = getActorId();
    if (!id) throw new ForbiddenException('Not authenticated.');
    return id;
  }

  /**
   * The patents tagged to one project, WITH their real numbers, for a member of that project.
   *
   * The membership check is the whole gate: `assertProjectAccess` is the same function that
   * decides whether somebody may open the project at all, so this cannot grant more than the
   * project itself already does.
   *
   * Every call is audited. Not because members are suspected of anything, but because "who looked
   * at which client's numbers" is exactly the question that gets asked after something leaks, and
   * a log written afterwards answers nothing.
   */
  async forProject(organizationId: string, projectId: string) {
    const actorId = this.actorId();
    await this.access.assertProjectAccess(actorId, projectId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, code: true, title: true },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const links = await this.prisma.projectPatent.findMany({
      where: { projectId, patent: { deletedAt: null, organizationId } },
      select: {
        patent: {
          select: { id: true, handle: true, serial: true, realNumber: true, formerHandles: true },
        },
      },
      orderBy: { patent: { serial: 'asc' } },
    });

    // Nothing to audit if there was nothing to see. An empty read is not an unmasking.
    if (links.length) {
      await this.events.emit({
        action: 'patent.numbers_viewed_by_member',
        entityType: 'PROJECT', entityId: projectId, organizationId, actorId,
        // The COUNT and the project, never the numbers themselves — an audit log that quotes the
        // secret it is protecting has copied the leak into a second, longer-lived place.
        metadata: { projectCode: project.code, count: links.length },
      });
    }

    return {
      project: { id: project.id, code: project.code, title: project.title },
      patents: links.map(l => ({
        id: l.patent.id,
        handle: l.patent.handle,
        serial: l.patent.serial,
        realNumber: l.patent.realNumber,
        formerHandles: l.patent.formerHandles,
      })),
      // Said explicitly so the screen can explain the boundary rather than leaving people to
      // wonder why the client is missing.
      clientVisible: false,
    };
  }

  /**
   * One patent's real number, for somebody who is on a project it is tagged to.
   *
   * The lookup runs the other way round from `forProject`: given a patent, find whether the caller
   * shares ANY project with it. That is what makes a handle in a task title, a comment or a
   * search result resolvable without first knowing which project to ask about.
   */
  async revealForMember(organizationId: string, patentId: string) {
    const actorId = this.actorId();

    // A patent.manage holder sees it regardless — they already can, through the portal.
    const isManager = await this.permissions.check(actorId, 'patent.manage');

    const patent = await this.prisma.patent.findFirst({
      where: { id: patentId, organizationId, deletedAt: null },
      select: {
        id: true, handle: true, serial: true, realNumber: true, formerHandles: true,
        projectLinks: { select: { projectId: true } },
      },
    });

    // One refusal, worded and coded identically whether the patent does not exist or simply is not
    // theirs. Told apart, the two answers turn this route into a directory: try an id, and a 404
    // versus a 403 says whether that patent is real. A manager still gets a plain 404, because for
    // somebody who may see every patent, "no such patent" gives nothing away.
    const refuse = () => new ForbiddenException(
      'That patent is not on any project you are staffed on. Ask the project manager to add you, or a Super Admin for the number.',
    );
    if (!patent) {
      if (isManager) throw new NotFoundException('Patent not found.');
      throw refuse();
    }

    let viaProjectId: string | null = null;
    if (!isManager) {
      for (const l of patent.projectLinks) {
        if (await this.access.canAccessProject(actorId, l.projectId)) { viaProjectId = l.projectId; break; }
      }
      if (!viaProjectId) throw refuse();
    }

    await this.events.emit({
      action: 'patent.number_revealed_to_member',
      entityType: 'PATENT', entityId: patent.id, organizationId, actorId,
      metadata: { handle: patent.handle, viaProjectId, asManager: isManager },
    });

    return {
      id: patent.id,
      handle: patent.handle,
      serial: patent.serial,
      realNumber: patent.realNumber,
      formerHandles: patent.formerHandles,
      /** Which project entitled the caller to see this. Null when they hold patent.manage. */
      viaProjectId,
      clientVisible: false,
    };
  }

  /**
   * The other direction: "I have the patent number — which ID do I quote?"
   *
   * This is the half of the problem that actually stops work. An analyst arrives holding
   * US 10,123,456 and has to log time, name a task and write a report against a handle. The
   * mapping existed only in a Super Admin's head, so the answer was to interrupt somebody, and the
   * common workaround — quoting the real number in a task title — puts the confidential thing on
   * the screen that concealment was supposed to keep it off.
   *
   * SCOPE IS THE SAME RULE, RUN BACKWARDS. A match is only returned when the caller shares a
   * project with that patent. Otherwise this becomes an oracle: type numbers, learn which ones the
   * firm holds and what they are coded as, and the handle scheme is finished.
   */
  async lookupByNumber(organizationId: string, rawNumber: string) {
    const actorId = this.actorId();
    const query = (rawNumber ?? '').trim();

    // Patent numbers are written a dozen ways for the same patent: "US 10,123,456 B2",
    // "US10123456B2", "us-10123456". Comparing the strings as typed would find almost nothing,
    // so both sides are reduced to letters and digits before matching. Done in SQL rather than in
    // JS so the whole table is not pulled into memory to be filtered.
    const normalized = query.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // The length is checked on the NORMALIZED string, not the typed one. Checking the raw input
    // let "%%%" through: three characters long, but nothing survives normalisation, so the LIKE
    // pattern collapses to '%%' and the query returns everything the caller can see. That turns a
    // lookup that demands you already know a number into one that hands you the list.
    if (normalized.length < 3) {
      throw new BadRequestException('Enter at least three letters or digits of the patent number.');
    }
    const rows = await this.prisma.$queryRaw<
      { id: string; handle: string; serial: number; realNumber: string }[]
    >`
      SELECT p."id", p."handle", p."serial", p."realNumber"
      FROM "patent" p
      WHERE p."organizationId" = ${organizationId}
        AND p."deletedAt" IS NULL
        AND UPPER(REGEXP_REPLACE(p."realNumber", '[^A-Za-z0-9]', '', 'g')) LIKE ${'%' + normalized + '%'}
      ORDER BY p."serial" ASC
      LIMIT 25
    `;

    const isManager = await this.permissions.check(actorId, 'patent.manage');
    const results: {
      id: string; handle: string; serial: number; realNumber: string; viaProjectId: string | null;
    }[] = [];

    for (const row of rows) {
      if (isManager) {
        results.push({ ...row, viaProjectId: null });
        continue;
      }
      const links = await this.prisma.projectPatent.findMany({
        where: { patentId: row.id }, select: { projectId: true },
      });
      for (const l of links) {
        if (await this.access.canAccessProject(actorId, l.projectId)) {
          results.push({ ...row, viaProjectId: l.projectId });
          break;
        }
      }
    }

    if (results.length) {
      await this.events.emit({
        action: 'patent.number_lookup',
        entityType: 'PATENT', entityId: results[0].id, organizationId, actorId,
        // The COUNT and whether it hit, never the number searched for — an audit log that records
        // the query has copied the confidential string into a second, longer-lived place.
        metadata: { matches: results.length, asManager: isManager },
      });
    }

    return {
      /**
       * How many patents in the firm matched BEFORE access was applied, versus how many the caller
       * may see. Deliberately NOT returned — reporting "3 matched, you may see 1" would answer the
       * question the scoping exists to refuse. A caller sees their own results and nothing about
       * the existence of others.
       */
      results,
      searchedFor: query,
      clientVisible: false,
    };
  }
}
