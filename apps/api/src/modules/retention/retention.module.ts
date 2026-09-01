import {
  Controller, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Post,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const BOOT_DELAY_MS = 120_000;                 // nothing here is urgent; stay out of boot's way
const BATCH = 5_000;

/**
 * Retention window in days, overridable per deployment. 0 or negative disables that purge, which
 * is the escape hatch if an investigation needs the history kept.
 */
function windowDays(envVar: string, fallback: number): number {
  const raw = Number(process.env[envVar]);
  return Number.isFinite(raw) ? raw : fallback;
}

/**
 * Deletes the rows nothing reads any more.
 *
 * Three tables grow with use and are never pruned, so they quietly become the largest in the
 * database — none of them holding anything anyone looks at once it is old:
 *
 *   • refresh_token   — one row per login AND per token rotation, so an active user adds rows all
 *                       day. Purged 30 days AFTER expiry (tokens live 14 days), never before:
 *                       a revoked-but-unexpired row is what detects a stolen token being replayed,
 *                       and deleting those early would throw that signal away.
 *   • analytics_event — telemetry behind the Performance page, which looks back at most 90 days,
 *                       or 180 with the previous-period comparison. Kept a year: double the
 *                       longest question anyone can ask of it.
 *   • activity        — the activity feed on tasks and projects. Kept a year.
 *
 * audit_log is deliberately NOT touched. It is the compliance record — who changed what — and is
 * the one table here whose value increases with age.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Retention');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Skip on replicas that aren't the designated background runner, as the other sweepers do.
    if (process.env.RUN_BACKGROUND_JOBS === 'false') return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    setTimeout(() => void this.sweep(), BOOT_DELAY_MS).unref?.();
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Deletes in batches rather than as one statement over a year of rows. A single DELETE that
   * wide holds its locks for as long as it runs, on the same box that is serving the app.
   */
  private async purgeBatched(
    findIds: (take: number) => Promise<{ id: string }[]>,
    deleteIds: (ids: string[]) => Promise<{ count: number }>,
  ): Promise<number> {
    let removed = 0;
    for (;;) {
      const batch = await findIds(BATCH);
      if (!batch.length) break;
      const { count } = await deleteIds(batch.map(r => r.id));
      removed += count;
      // A batch that deletes nothing means something else already took those rows; stop rather
      // than ask for the same ids forever.
      if (count === 0 || batch.length < BATCH) break;
    }
    return removed;
  }

  async sweep(): Promise<{ refreshTokens: number; analyticsEvents: number; activities: number }> {
    const result = { refreshTokens: 0, analyticsEvents: 0, activities: 0 };
    if (this.running) return result;
    this.running = true;
    const now = Date.now();
    const cutoff = (d: number) => new Date(now - d * 86_400_000);

    try {
      const tokenDays = windowDays('RETENTION_REFRESH_TOKEN_DAYS', 30);
      if (tokenDays > 0) {
        // Measured against expiresAt, not createdAt: a live session must never be swept.
        const before = cutoff(tokenDays);
        result.refreshTokens = await this.purgeBatched(
          take => this.prisma.refreshToken.findMany({ where: { expiresAt: { lt: before } }, select: { id: true }, take }),
          ids => this.prisma.refreshToken.deleteMany({ where: { id: { in: ids } } }),
        );
      }

      const analyticsDays = windowDays('RETENTION_ANALYTICS_DAYS', 365);
      if (analyticsDays > 0) {
        const before = cutoff(analyticsDays);
        result.analyticsEvents = await this.purgeBatched(
          take => this.prisma.analyticsEvent.findMany({ where: { createdAt: { lt: before } }, select: { id: true }, take }),
          ids => this.prisma.analyticsEvent.deleteMany({ where: { id: { in: ids } } }),
        );
      }

      const activityDays = windowDays('RETENTION_ACTIVITY_DAYS', 365);
      if (activityDays > 0) {
        const before = cutoff(activityDays);
        result.activities = await this.purgeBatched(
          take => this.prisma.activity.findMany({ where: { createdAt: { lt: before } }, select: { id: true }, take }),
          ids => this.prisma.activity.deleteMany({ where: { id: { in: ids } } }),
        );
      }

      const total = result.refreshTokens + result.analyticsEvents + result.activities;
      if (total) {
        this.logger.log(
          `retention: removed ${result.refreshTokens} refresh token(s), ` +
          `${result.analyticsEvents} analytics event(s), ${result.activities} activity row(s)`,
        );
      }
      return result;
    } catch (err) {
      // A failed purge must never take the API down with it — the rows simply stay another day.
      this.logger.warn(`retention sweep failed: ${String(err)}`);
      return result;
    } finally {
      this.running = false;
    }
  }
}

@Controller('retention')
class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  /** Run the purge now instead of waiting for the daily pass. Returns what it removed. */
  @Post('sweep')
  @RequirePermission('settings.update')
  sweep() {
    return this.retention.sweep();
  }
}

@Module({
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
