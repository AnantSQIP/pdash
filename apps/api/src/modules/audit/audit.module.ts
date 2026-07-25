import { Controller, Get, Header, Module, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

@Controller()
class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly actor: ActorContextService,
  ) {}

  // Activity feed — used by the project Activity tab and admin views. Org is session-derived;
  // access is enforced in the service (audit.view = org-wide, else a matter you can access).
  @Get('activity')
  async activity(
    @Query('projectId') projectId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listActivity(
      { projectId, entityType, entityId, limit: limit ? parseInt(limit, 10) : undefined },
      await this.actor.requireOrgId(),
    );
  }

  @Get('audit-logs')
  @RequirePermission('audit.view')
  async auditLogs(
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.audit.listAuditLogs({ organizationId: await this.actor.requireOrgId(), entityType, action, userId, limit: limit ? parseInt(limit, 10) : undefined, cursor });
  }

  @Get('audit-logs/export')
  @RequirePermission('audit.export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  async export(
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
  ) {
    return this.audit.exportAuditLogsCsv({ organizationId: await this.actor.requireOrgId(), entityType, action, userId });
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
