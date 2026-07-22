import { Global, Module } from '@nestjs/common';
import { SequenceService } from './sequence.service';

// Global so both ProjectsModule (PIDs) and PatentsModule (patent handles) can inject the
// one allocator without re-providing it (which would create two independent instances).
@Global()
@Module({
  providers: [SequenceService],
  exports: [SequenceService],
})
export class SequenceModule {}
