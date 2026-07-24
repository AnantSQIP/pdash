import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    // Return HTTP 503 (not 200) when the DB is unreachable, so an ALB/ECS health check pulls a
    // DB-severed task out of rotation instead of keeping it live.
    if (db !== 'up') throw new ServiceUnavailableException({ status: 'degraded', db });
    return { status: 'ok', db };
  }
}
