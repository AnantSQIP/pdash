import { Module } from '@nestjs/common';
import { PatentsController } from './patents.controller';
import { PatentsService } from './patents.service';
import { ClientLedgerController } from './client-ledger.controller';
import { ClientLedgerService } from './client-ledger.service';
import { DocumentsModule } from '../documents/documents.module';
import { PatentVisibilityService } from './patent-visibility.service';
import { ProjectAccessModule } from '../../common/access/project-access.module';

@Module({
  // ProjectAccessModule so a patent's real number can be gated on PROJECT MEMBERSHIP — the
  // same check that decides whether somebody may open the project at all.
  imports: [DocumentsModule, ProjectAccessModule],
  // Two controllers, two screens: the confidential patent portal, and the client ledger.
  controllers: [PatentsController, ClientLedgerController],
  providers: [PatentsService, ClientLedgerService, PatentVisibilityService],
  exports: [PatentsService],
})
export class PatentsModule {}
