import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
    // Time tracking
    TimesheetsModule,
    // Calendar, Discuss, Issues, Analytics
    EventsModule,
    ChannelsModule,
    IssuesModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
