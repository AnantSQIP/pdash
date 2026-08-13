import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { DealsService } from './deals.service';
import { CreateDealDto, LogActivityDto, MoveDealDto, UpdateDealDto } from './dto';
import { DEAL_STAGES } from '../../common/deal-stages';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';

/**
 * The business-development pipeline.
 *
 * `deal.view` to read it, `deal.manage` to change it. Commercial in nature — who we are talking to
 * and for how much — so it is not in everyone's basics, but it is deliberately NOT scoped to the
 * deals you personally own: a pipeline each person sees only their slice of cannot be forecast,
 * and forecasting is most of why it exists.
 */
@Controller('deals')
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly actor: ActorContextService,
  ) {}

  /** The stage definitions — one source for the board, the forecast and validation. */
  @Get('stages') @RequirePermission('deal.view')
  stages() {
    return DEAL_STAGES;
  }

  /** Counts, values, weighted forecast, win rate, cycle time and why deals are lost. */
  @Get('summary') @RequirePermission('deal.view')
  async summary() {
    return this.deals.summary(await this.actor.requireOrgId());
  }

  /** A suggested client code for a company name — used when winning a deal. */
  @Get('client-code-suggestion') @RequirePermission('deal.view')
  async suggestCode(@Query('company') company?: string) {
    return this.deals.suggestClientCodeFor(await this.actor.requireOrgId(), company ?? '');
  }

  @Get() @RequirePermission('deal.view')
  async list(@Query('stage') stage?: string, @Query('ownerId') ownerId?: string) {
    return this.deals.list(await this.actor.requireOrgId(), { stage, ownerId });
  }

  @Post() @RequirePermission('deal.manage')
  async create(@Body() dto: CreateDealDto) {
    return this.deals.create(await this.actor.requireOrgId(), dto);
  }

  @Get(':id') @RequirePermission('deal.view')
  async get(@Param('id') id: string) {
    return this.deals.get(await this.actor.requireOrgId(), id);
  }

  @Patch(':id') @RequirePermission('deal.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(await this.actor.requireOrgId(), id, dto);
  }

  /** Move along the pipeline. Losing requires a reason; winning may mint or link a client. */
  @Put(':id/stage') @RequirePermission('deal.manage')
  async move(@Param('id') id: string, @Body() dto: MoveDealDto) {
    return this.deals.move(await this.actor.requireOrgId(), id, dto);
  }

  @Post(':id/activities') @RequirePermission('deal.manage')
  async logActivity(@Param('id') id: string, @Body() dto: LogActivityDto) {
    return this.deals.logActivity(await this.actor.requireOrgId(), id, dto);
  }

  @Delete(':id') @RequirePermission('deal.manage')
  async remove(@Param('id') id: string) {
    return this.deals.remove(await this.actor.requireOrgId(), id);
  }
}
