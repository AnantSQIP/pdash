import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditEventsModule } from './modules/audit-events/audit-events.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { CurrentActorMiddleware } from './common/middleware/current-actor.middleware';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TaskListsModule } from './modules/tasklists/tasklists.module';
import { MilestonesModule } from './modules/milestones/milestones.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { StatusesModule } from './modules/statuses/statuses.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { EventsModule } from './modules/events/events.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { IssuesModule } from './modules/issues/issues.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limit primitives (applied selectively, e.g. on auth, via ThrottlerGuard).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
    AuditEventsModule,
    PermissionsModule,
    AuthModule,
    HealthModule,
    // Org
    OrganizationsModule,
    // Core project management
    ProjectsModule,
    TaskListsModule,
    MilestonesModule,
    TasksModule,
    // Workflow engine
    WorkflowsModule,
    StatusesModule,
    // Generic/polymorphic
    CommentsModule,
    ApprovalsModule,
    // People & org
    UsersModule,
    DepartmentsModule,
    // Time tracking & attendance
    TimesheetsModule,
    AttendanceModule,
    // Calendar, Discuss, Issues, Analytics
    EventsModule,
    ChannelsModule,
    IssuesModule,
    AnalyticsModule,
    AuditModule,
    PerformanceModule,
    NotificationsModule,
  ],
  providers: [
    // 1) Global authentication (deny-by-default; @Public() opts out).
    { provide: APP_GUARD, useClass: AuthGuard },
    // 2) Global, opt-in authorization (enforces only where @RequirePermission is set).
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Populate per-request actor context from the x-actor-id header on every route.
    consumer.apply(CurrentActorMiddleware).forRoutes('*');
  }
}
