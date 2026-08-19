import { Module } from '@nestjs/common';
import { PatentsController } from './patents.controller';
import { PatentsService } from './patents.service';
import { ClientLedgerController } from './client-ledger.controller';
import { ClientLedgerService } from './client-ledger.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  // Two controllers, two screens: the confidential patent portal, and the client ledger.
  controllers: [PatentsController, ClientLedgerController],
  providers: [PatentsService, ClientLedgerService],
  exports: [PatentsService],
})
export class PatentsModule {}
