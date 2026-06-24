import { Module } from '@nestjs/common';

// ProjectGroup was removed in ERD v2.0 (replaced by Department + Team).
// Stub kept to avoid broken imports from old code that referenced this module.
@Module({})
export class ProjectGroupsModule {}
