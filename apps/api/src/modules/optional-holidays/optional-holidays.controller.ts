import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { OptionalHolidaysService } from './optional-holidays.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

/**
 * Optional holidays — four declared a year, two per person, applied for in advance.
 *
 * Choosing one is something everybody does for themselves, so it sits behind `holiday.view`, which
 * is in the basics. Deciding on somebody else's request is `leave.approve` — the same right and the
 * same people (HR, Admin, Super Admin) that approve leave, because it is the same kind of call.
 */
@Controller('optional-holidays')
export class OptionalHolidaysController {
  constructor(
    private readonly optional: OptionalHolidaysService,
    private readonly actor: ActorContextService,
  ) {}

  /** The year's optional holidays, my standing with each, and how much allowance is left. */
  @Get() @RequirePermission('holiday.view')
  async mine(@Query('year') year?: string) {
    return this.optional.listForActor(await this.actor.requireOrgId(), year ? Number(year) : undefined);
  }

  /** The HR decision queue. Declared before `:id` routes so it is reachable. */
  @Get('pending') @RequirePermission('leave.approve')
  async pending() {
    return this.optional.pending(await this.actor.requireOrgId());
  }

  @Post(':id/elect') @RequirePermission('holiday.view')
  async elect(@Param('id') id: string) {
    return this.optional.elect(await this.actor.requireOrgId(), id);
  }

  /** Withdraw my own request, freeing the allowance again. */
  @Post('elections/:electionId/cancel') @RequirePermission('holiday.view')
  async cancel(@Param('electionId') electionId: string) {
    return this.optional.cancel(await this.actor.requireOrgId(), electionId);
  }

  @Post('elections/:electionId/approve') @RequirePermission('leave.approve')
  async approve(@Param('electionId') electionId: string, @Body() body?: { note?: string }) {
    return this.optional.review(await this.actor.requireOrgId(), electionId, true, body?.note);
  }

  @Post('elections/:electionId/reject') @RequirePermission('leave.approve')
  async reject(@Param('electionId') electionId: string, @Body() body?: { note?: string }) {
    return this.optional.review(await this.actor.requireOrgId(), electionId, false, body?.note);
  }
}
