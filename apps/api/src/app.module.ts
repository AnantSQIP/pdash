import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectAccessModule } from './common/access/project-access.module';
import { ActorContextModule } from './common/context/actor-context.service';
import { AuditEventsModule } from './modules/audit-events/audit-events.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { PasscodeGuard } from './common/guards/passcode.guard';
import { AllExceptionsFilter } from './common/filters/prisma-exception.filter';
import { CurrentActorMiddleware } from './common/middleware/current-actor.middleware';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TaskListsModule } from './modules/tasklists/tasklists.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { StatusesModule } from './modules/statuses/statuses.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CommentsModule } from './modules/comments/comments.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { DeadlinesModule } from './modules/deadlines/deadline-visibility.service';
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
import { ProfileModule } from './modules/profile/profile.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { OverdueModule } from './modules/overdue/overdue.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PresenceModule } from './modules/presence/presence.module';
import { SearchModule } from './modules/search/search.module';
import { TagsModule } from './modules/tags/tags.module';
import { CompanyModule } from './modules/company/company.module';
import { AppraisalsModule } from './modules/appraisals/appraisals.module';
import { SequenceModule } from './common/sequence/sequence.module';
import { PatentsModule } from './modules/patents/patents.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limit primitives (applied selectively, e.g. on auth, via ThrottlerGuard).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
    ProjectAccessModule, // object-level authz for the delivery domain (projects/tasks/issues)
    ActorContextModule, // session-derived org identity (never client-supplied)
    AuditEventsModule,
    PermissionsModule,
    DeadlinesModule,
    AuthModule,
    HealthModule,
    // Org
    OrganizationsModule,
    // Core project management
    ProjectsModule,
    TaskListsModule,
    TasksModule,
    // Workflow engine
    WorkflowsModule,
    StatusesModule,
    // Generic/polymorphic
    CommentsModule,
    DocumentsModule,
    ApprovalsModule,
    // People & org
    UsersModule,
    ProfileModule, // private joining details (PII, two-tier visibility)
    DepartmentsModule,
    // Time tracking & attendance
    TimesheetsModule,
    AttendanceModule,
    ExpensesModule,
    // Calendar, Discuss, Issues, Analytics
    EventsModule,
    ChannelsModule,
    IssuesModule,
    AnalyticsModule,
    AuditModule,
    PerformanceModule,
    // Team availability board + the deadline watchdog that feeds its alerts.
    CapacityModule,
    OverdueModule,
    NotificationsModule,
    PresenceModule,
    SearchModule,
    TagsModule,
    CompanyModule,
    AppraisalsModule,
    // Atomic serial allocator (PIDs + patent handles) and the confidential patent portal.
    SequenceModule,
    PatentsModule,
  ],
  providers: [
    // 0) Global error mapping: Prisma/unknown errors → correct HTTP status (not 500).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 1) Global authentication (deny-by-default; @Public() opts out).
    { provide: APP_GUARD, useClass: AuthGuard },
    // 2) Global, opt-in authorization (enforces only where @RequirePermission is set).
    { provide: APP_GUARD, useClass: PermissionGuard },
    // 3) Global, opt-in step-up: "big change" routes marked @RequirePasscode() also
    //    require the org passcode (a second factor on top of RBAC). Runs last, so an
    //    unauthenticated / unpermitted caller is rejected before any passcode prompt.
    { provide: APP_GUARD, useClass: PasscodeGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Populate per-request actor context from the x-actor-id header on every route.
    consumer.apply(CurrentActorMiddleware).forRoutes('*');
  }
}
