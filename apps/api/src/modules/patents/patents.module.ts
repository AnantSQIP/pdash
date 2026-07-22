import { Module } from '@nestjs/common';
import { PatentsController } from './patents.controller';
import { PatentsService } from './patents.service';

@Module({
  controllers: [PatentsController],
  providers: [PatentsService],
  exports: [PatentsService],
})
export class PatentsModule {}
