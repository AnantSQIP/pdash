import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { CapacityModule } from '../capacity/capacity.module';

@Module({
  // CapacityModule so the pipeline can ask whether the work about to land can be absorbed.
  imports: [CapacityModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
