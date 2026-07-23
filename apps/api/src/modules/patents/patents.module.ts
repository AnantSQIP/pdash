import { Module } from '@nestjs/common';
import { PatentsController } from './patents.controller';
import { PatentsService } from './patents.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  controllers: [PatentsController],
  providers: [PatentsService],
  exports: [PatentsService],
})
export class PatentsModule {}
