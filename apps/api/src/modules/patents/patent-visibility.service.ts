import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { ProjectAccessService } from '../../common/access/project-access.module';
import { EventService } from '../audit-events/event.service';
import { getActorId } from '../../common/context/request-context';

/**
 * Who may see a real patent number, and on what grounds.
 *
 * THE THING THAT IS ACTUALLY SECRET
 *
 * A patent number is not confidential. Patents are published documents; US 10,123,456 can be read
 * by anyone on Google Patents. What this firm must protect is the ASSOCIATION — that *we* are
 * working on that patent, *for Mailike*. The commercially sensitive half is the client, not the
 * number.
 *
 * That distinction is what this whole file rests on, and getting it the wrong way round is what
 * made the system unusable: the number was locked behind a Super Admin's passcode while the
 * client code sat in plain sight inside every handle. The genuinely public half was guarded and
 * the genuinely private half was not.
 *
 * THE MODEL
 *
 *   1. RESOLVE — anyone with `patent.view` (every role but HR).
 *      Ask "what is Pat_ABC_001?" or "what ID do I quote for US 10,123,456?" and get an answer.
 *      One patent at a time, from a query you already hold half of. NEVER the client.
 *
 *   2. LIST FOR A PROJECT — members of that project.
 *      The whole working set for a matter you are staffed on, in one call, so nobody has to
 *      resolve six handles individually. NEVER the client.
 *
 *   3. EVERYTHING — `patent.manage`, plus the passcode for a bulk reveal.
 *      Browse the portfolio, see which client owns what, export. This is the tier that answers
 *      commercial questions, and it stays with the people who own client relationships.
 *
 * WHY RESOLVE IS OPEN BUT BROWSE IS NOT
 *
 * An analyst asked to look at Pat_ABC_001 needs an answer in seconds, and the firm has ~27 people
 * who might be asked. Gating that on project membership meant the answer was "ask a Super Admin",
 * which in practice means the number gets pasted into a task title — putting the confidential
 * string on the exact screen the handles exist to keep it off. Opening resolution removes the
 * incentive for that workaround.
 *
 * Browsing is a different act. `listPatents` — the whole portfolio in one response — stays on
 * `patent.manage`, because "show me everything" is not a question anybody needs answered to do
 * their job, and it is the single request that turns a leak into a dump.
 *
 * WHAT THIS DOES NOT PREVENT, STATED PLAINLY
 *
 * Handles are sequential (`Pat_ABC_1`, `Pat_ABC_2`, …). Somebody who knows a client code can walk
 * the series and resolve each one. Rate limiting and auditing do not make that impossible; they
 * make it *slow and loud* — a sustained, logged, attributable pattern instead of one silent
 * script. Against a determined insider that is the honest ceiling for any design where colleagues
 * can look things up at all, and it is why the client association — the half that actually costs
 * the firm if it leaks — is never returned here at any tier.
 */

/** Non-managers get a small answer. Enough to identify a patent, not enough to accumulate one. */
const MAX_RESULTS_FOR_COLLEAGUE = 10;

/**
 * Lookups one person may make per hour before being asked to slow down.
 *
 * Sized against real use, not against an attacker: reading a report and checking every handle in
 * it is perhaps a dozen lookups, and a busy day is a few dozen. 120 leaves ordinary work
 * untouched while making a portfolio walk take days and fill the audit log while it does.
 *
 * Counted from the audit log rather than memory, so it survives a restart, holds across replicas,
 * and cannot be reset by logging out.
 */
const LOOKUP_BUDGET_PER_HOUR = 120;

/**
 * Split a handle into its client code and serial, however it happens to be written.
 *
 * Handles in this database are NOT consistently formatted: the seed wrote `Pat_MLK_1` while the
 * formatter mints `Pat_MLK_001`, so both live in the same table. Those are different strings, and
 * an exact match means somebody who types the padded form of an unpadded handle — or reads one off
 * a report written before the formatter changed — gets "no such patent" for a patent that plainly
 * exists.
 *
 * Comparing on (code, serial) instead of on the string makes the padding, the case and the
 * separator irrelevant, which is the only way a person quoting an ID from memory or from an email
 * reliably finds it.
 */
function parseHandle(raw: string): { code: string; serial: number } | null {
  const m = /^\s*pat[_-]?([A-Za-z0-9]+)[_-]0*(\d+)\s*$/i.exec(raw ?? '');
  if (!m) return null;
  const serial = Number(m[2]);
  if (!Number.isSafeInteger(serial) || serial < 0) return null;
  return { code: m[1].toUpperCase(), serial };
}

/** Do these two handles name the same patent, ignoring padding, case and separator? */
function sameHandle(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = parseHandle(a); const pb = parseHandle(b);
  return !!pa && !!pb && pa.code === pb.code && pa.serial === pb.serial;
}

const LOOKUP_ACTIONS = [
  'patent.number_resolved',
  'patent.number_lookup',
  'patent.numbers_viewed_by_member',
];

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
   * Refuse a lookup once this person has made an implausible number of them in an hour.
   *
   * A `patent.manage` holder is exempt: they can already browse the whole portfolio through the
   * portal, so throttling their lookups protects nothing and would only obstruct the people who
   * are supposed to have the full picture.
   */
  private async assertWithinBudget(actorId: string, isManager: boolean): Promise<void> {
    if (isManager) return;
    const since = new Date(Date.now() - 60 * 60 * 1000);
    // Hits the existing [userId, timestamp] index, so the check costs a count on a narrow range
    // rather than a scan — it runs on every lookup and must stay cheap.
    const used = await this.prisma.auditLog.count({
      where: { userId: actorId, action: { in: LOOKUP_ACTIONS }, timestamp: { gte: since } },
    });
    if (used >= LOOKUP_BUDGET_PER_HOUR) {
      throw new ForbiddenException(
        'You have looked up an unusual number of patents in the past hour. This limit exists to '
        + 'stop the portfolio being harvested; it resets shortly. If you genuinely need bulk access, '
        + 'ask a Super Admin.',
      );
    }
  }

  /** Everything a colleague may see about a patent. The client is deliberately not in this list. */
  private colleagueView(p: {
    id: string; handle: string; serial: number; realNumber: string; formerHandles: string[];
  }) {
    return {
      id: p.id,
      handle: p.handle,
      serial: p.serial,
      realNumber: p.realNumber,
      formerHandles: p.formerHandles,
      /** Said explicitly so a screen can explain the boundary instead of leaving people to wonder. */
      clientVisible: false as const,
    };
  }

  /**
   * The patents tagged to one project, WITH their real numbers, for a member of that project.
   *
   * The membership check is the whole gate: `assertProjectAccess` is the same function that
   * decides whether somebody may open the project at all, so this cannot grant more than the
   * project itself already does.
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
      patents: links.map(l => this.colleagueView(l.patent)),
      clientVisible: false,
    };
  }

  /**
   * "What is this patent?" — by internal id or by handle, for any colleague.
   *
   * Accepts a handle because that is what people actually hold: a handle is what appears in a task
   * title, a comment, or an email from a colleague. Requiring the internal id would mean the
   * lookup only worked from screens that already had the patent loaded, which is precisely where
   * it is least needed.
   *
   * RETIRED HANDLES RESOLVE TOO. A client-code rename rewrites live handles and pushes the old one
   * into `formerHandles`; an ID quoted in a six-month-old email must still find its patent, or the
   * rename silently breaks every document that has left the building.
   */
  async resolve(organizationId: string, query: { patentId?: string; handle?: string }) {
    const actorId = this.actorId();
    const isManager = await this.permissions.check(actorId, 'patent.manage');
    await this.assertWithinBudget(actorId, isManager);

    const patentId = (query.patentId ?? '').trim();
    const handle = (query.handle ?? '').trim();
    if (!patentId && !handle) {
      throw new BadRequestException('Provide a patent ID to look up.');
    }

    const select = {
      id: true, handle: true, serial: true, realNumber: true, formerHandles: true,
    } as const;
    const base = { organizationId, deletedAt: null };

    let patent = patentId
      ? await this.prisma.patent.findFirst({ where: { ...base, id: patentId }, select })
      : null;

    if (!patent && handle) {
      // A LIVE handle always beats a retired one, and the two can genuinely be the same string:
      // rename client MLK and "MLK" becomes free for a different client to mint Pat_MLK_001 for
      // real. Ordered lookups make that precedence explicit rather than leaving it to whichever
      // row the planner happens to reach first.

      // 1. The string exactly as typed.
      patent = await this.prisma.patent.findFirst({ where: { ...base, handle }, select });

      // 2. The same handle written differently — Pat_MLK_1 vs Pat_MLK_001 vs pat-mlk-1. Matched
      //    on the client's code and the serial, so formatting cannot hide a patent that exists.
      if (!patent) {
        const parsed = parseHandle(handle);
        if (parsed) {
          patent = await this.prisma.patent.findFirst({
            where: {
              ...base,
              serial: parsed.serial,
              client: { code: { equals: parsed.code, mode: 'insensitive' }, deletedAt: null },
            },
            select,
          });
        }
      }

      // 3. A handle this patent used to carry, before a client-code rename.
      if (!patent) {
        patent = await this.prisma.patent.findFirst({
          where: { ...base, formerHandles: { has: handle } },
          orderBy: { createdAt: 'asc' }, select,
        });
      }

      // 4. A retired handle written in a different format. Retired handles live in a string array,
      //    so there is no indexable way to compare them normalised — this walks only the rows that
      //    HAVE a retired handle for the right client, which is a small set and the last resort.
      if (!patent) {
        const parsed = parseHandle(handle);
        if (parsed) {
          const candidates = await this.prisma.patent.findMany({
            where: {
              ...base,
              serial: parsed.serial,
              NOT: { formerHandles: { isEmpty: true } },
            },
            orderBy: { createdAt: 'asc' },
            select: { ...select, formerHandles: true },
          });
          patent = candidates.find(c =>
            c.formerHandles.some(h => {
              const p = parseHandle(h);
              return p && p.code === parsed.code && p.serial === parsed.serial;
            }),
          ) ?? null;
        }
      }
    }

    if (!patent) {
      throw new NotFoundException(
        handle
          ? `No patent has ever been identified as "${handle}".`
          : 'Patent not found.',
      );
    }

    await this.events.emit({
      action: 'patent.number_resolved',
      entityType: 'PATENT', entityId: patent.id, organizationId, actorId,
      metadata: { handle: patent.handle, viaHandle: !!handle, asManager: isManager },
    });

    return {
      ...this.colleagueView(patent),
      /**
       * False when the caller quoted a handle this patent no longer carries.
       *
       * Compared on (code, serial) rather than on the string, or `Pat_MLK_001` would be reported
       * as retired for a patent whose live handle is `Pat_MLK_1` — the same ID, written the other
       * way, and telling somebody their perfectly current ID has been retired is worse than saying
       * nothing.
       */
      current: handle ? sameHandle(patent.handle, handle) : true,
      searchedFor: handle || patentId,
    };
  }

  /**
   * "I have the patent number — which ID do I quote?"
   *
   * The half of the problem that actually stops work. An analyst arrives holding US 10,123,456 and
   * has to log time, name a task and write a report against a handle.
   */
  async lookupByNumber(organizationId: string, rawNumber: string) {
    const actorId = this.actorId();
    const isManager = await this.permissions.check(actorId, 'patent.manage');
    await this.assertWithinBudget(actorId, isManager);

    const query = (rawNumber ?? '').trim();

    // Patent numbers are written a dozen ways for the same patent: "US 10,123,456 B2",
    // "US10123456B2", "us-10123456". Comparing as typed would find almost nothing, so both sides
    // are reduced to letters and digits. Done in SQL so the table is not pulled into memory.
    const normalized = query.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // The length is checked on the NORMALIZED string, not the typed one. Checking the raw input
    // let "%%%" through: three characters long, nothing left after normalisation, so the LIKE
    // pattern collapsed to '%%' and returned everything. That turns a lookup which demands you
    // already know a number into one that hands you the list.
    if (normalized.length < 3) {
      throw new BadRequestException('Enter at least three letters or digits of the patent number.');
    }

    const limit = isManager ? 25 : MAX_RESULTS_FOR_COLLEAGUE;
    const rows = await this.prisma.$queryRaw<
      { id: string; handle: string; serial: number; realNumber: string; formerHandles: string[] }[]
    >`
      SELECT p."id", p."handle", p."serial", p."realNumber", p."formerHandles"
      FROM "patent" p
      WHERE p."organizationId" = ${organizationId}
        AND p."deletedAt" IS NULL
        AND UPPER(REGEXP_REPLACE(p."realNumber", '[^A-Za-z0-9]', '', 'g')) LIKE ${'%' + normalized + '%'}
      ORDER BY p."serial" ASC
      LIMIT ${limit}
    `;

    if (rows.length) {
      await this.events.emit({
        action: 'patent.number_lookup',
        entityType: 'PATENT', entityId: rows[0].id, organizationId, actorId,
        // The COUNT, never the number searched for — an audit log that records the query has
        // copied the confidential string into a second, longer-lived place.
        metadata: { matches: rows.length, asManager: isManager },
      });
    }

    return {
      results: rows.map(r => this.colleagueView(r)),
      searchedFor: query,
      /** True when the cap was reached, so the screen can say "narrow your search". */
      truncated: rows.length >= limit,
      clientVisible: false,
    };
  }
}
