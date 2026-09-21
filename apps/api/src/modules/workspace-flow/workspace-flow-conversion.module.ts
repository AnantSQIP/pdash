import { Module } from '@nestjs/common';
import { WorkspaceFlowController } from './workspace-flow.controller';
import { WorkspaceFlowConversionService } from './workspace-flow-conversion.service';

/**
 * Changing an organisation's workspace flow (Settings → Workspace flow). Separate from the global
 * WorkspaceFlowModule, which only answers WHICH flow an organisation runs.
 */
@Module({
  controllers: [WorkspaceFlowController],
  providers: [WorkspaceFlowConversionService],
})
export class WorkspaceFlowConversionModule {}
