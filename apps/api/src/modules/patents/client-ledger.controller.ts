import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ClientLedgerService } from './client-ledger.service';
import { UpdateLedgerOverrideDto } from './dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { getActorId } from '../../common/context/request-context';

/**
 * The client ledger — a separate screen from the patent portal, on purpose.
 *
 * Gated on `patent.manage` because it is keyed by CLIENT, and client identity is the
 * Super-Admin-only fact in this system: knowing that "MLK" is a particular company, and how much
 * work we have done for them, is exactly what the portal's confidentiality protects. No real
 * patent numbers appear here at any point, so nothing needs the step-up passcode.
 */
@Controller('client-ledger')
export class ClientLedgerController {
  constructor(
    private readonly ledger: ClientLedgerService,
    private readonly actor: ActorContextService,
  ) {}

  @Get() @RequirePermission('patent.manage')
  async list(@Query('includeArchived') includeArchived?: string) {
    return this.ledger.list(await this.actor.requireOrgId(), includeArchived !== 'false');
  }

  /**
   * Hours that belong to no client. Declared BEFORE `:clientId` — Nest matches in order, so a
   * literal segment defined after a parameter one would never be reached.
   */
  /** Where the client → patent → PID → hours chain is broken. Counts and identifiers only. */
  @Get('gaps') @RequirePermission('patent.manage')
  async gaps() {
    return this.ledger.chainGaps(await this.actor.requireOrgId());
  }

  @Get('unattributed') @RequirePermission('patent.manage')
  async unattributed() {
    return this.ledger.unattributed(await this.actor.requireOrgId());
  }

  @Get(':clientId') @RequirePermission('patent.manage')
  async detail(@Param('clientId') clientId: string) {
    return this.ledger.detail(await this.actor.requireOrgId(), clientId);
  }

  /**
   * State (or clear) the figures for a client. `patent.manage` is Super-Admin-only, which is the
   * gate the Phase 2 decision asks for. No step-up passcode: this is reversible, fully audited
   * with both old and new values, and meant to be corrected as often as the facts change —
   * gating it would only train people to type the passcode without reading the prompt.
   */
  @Patch(':clientId/override') @RequirePermission('patent.manage')
  async setOverride(@Param('clientId') clientId: string, @Body() dto: UpdateLedgerOverrideDto) {
    return this.ledger.setOverride(await this.actor.requireOrgId(), getActorId()!, clientId, dto);
  }
}
