import { Module } from '@nestjs/common';
import { OptionalHolidaysController } from './optional-holidays.controller';
import { OptionalHolidaysService } from './optional-holidays.service';

@Module({
  controllers: [OptionalHolidaysController],
  providers: [OptionalHolidaysService],
  // Exported so capacity and attendance can fold an approved optional holiday into the same
  // per-person day exclusion they already apply to approved leave.
  exports: [OptionalHolidaysService],
})
export class OptionalHolidaysModule {}
