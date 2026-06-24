import { Module } from '@nestjs/common';
import { RollupService } from './rollup.service';

@Module({
  providers: [RollupService],
  exports: [RollupService],
})
export class RollupModule {}
