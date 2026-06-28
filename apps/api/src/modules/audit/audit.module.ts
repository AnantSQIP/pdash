import { Controller, Get, Header, Module, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@Controller()
class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Activity feed — used by the project Activity tab and admin views (authenticated).
  @Get('activity')
  activity(
    @Query('projectId') projectId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.listActivity({ projectId, entityType, entityId, organizationId, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get('audit-logs')
  @RequirePermission('audit.view')
  auditLogs(
    @Query('organizationId') organizationId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.audit.listAuditLogs({ organizationId, entityType, action, userId, limit: limit ? parseInt(limit, 10) : undefined, cursor });
  }

  @Get('audit-logs/export')
  @RequirePermission('audit.export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  export(
    @Query('organizationId') organizationId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
  ) {
    return this.audit.exportAuditLogsCsv({ organizationId, entityType, action, userId });
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
