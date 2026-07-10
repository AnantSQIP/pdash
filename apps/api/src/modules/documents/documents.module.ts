import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  // Exported so Channels/Comments can validate + clean up attachments.
  exports: [DocumentsService],
})
export class DocumentsModule {}
