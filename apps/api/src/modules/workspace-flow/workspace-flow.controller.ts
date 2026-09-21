import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { WORKSPACE_FLOW_NAMES, type WorkspaceFlowName } from '@pdash/db';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { WorkspaceFlowConversionService } from './workspace-flow-conversion.service';

class PreflightDto {
  @IsIn(WORKSPACE_FLOW_NAMES as unknown as string[]) to!: WorkspaceFlowName;
}

class ConvertDto {
  @IsIn(WORKSPACE_FLOW_NAMES as unknown as string[]) to!: WorkspaceFlowName;
  /** The organisation's name, typed exactly. */
  @IsOptional() @IsString() @MaxLength(200) confirm?: string;
  /** The person converting says a backup was taken. Must be true. */
  @IsOptional() @IsBoolean() backupTaken?: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * Settings → Workspace flow (docs/WORKSPACE_FLOWS.md, "Changing the flow").
 *
 *   GET  /organizations/:id/workspace-flow            the flow, when it was chosen, in use?, history
 *   POST /organizations/:id/workspace-flow/preflight  the dry run — what converting would change
 *   POST /organizations/:id/workspace-flow/convert    convert (Super Admin + org passcode + the
 *                                                     organisation's name typed + backup confirmed)
 *
 * The organisation in the path must be the caller's own — the tenant is who they are, not what
 * they type. Every route is gated on user.manage_access first (Admin / Super Admin / HR), so
 * nobody else ever reaches the passcode prompt; preflight and convert then require a Super Admin.
 */
@Controller('organizations/:id/workspace-flow')
export class WorkspaceFlowController {
  constructor(
    private readonly conversion: WorkspaceFlowConversionService,
    private readonly actor: ActorContextService,
  ) {}

  @Get()
  @RequirePermission('user.manage_access')
  async state(@Param('id') id: string) {
    await this.assertOwnOrg(id);
    return this.conversion.state(id, this.actor.requireActorId());
  }

  @Post('preflight')
  @HttpCode(200)
  @RequirePermission('user.manage_access')
  async preflight(@Param('id') id: string, @Body() dto: PreflightDto) {
    await this.assertOwnOrg(id);
    return this.conversion.preflight(id, this.actor.requireActorId(), dto.to);
  }

  @Post('convert')
  @HttpCode(200)
  @RequirePermission('user.manage_access')
  @RequirePasscode()
  async convert(@Param('id') id: string, @Body() dto: ConvertDto) {
    await this.assertOwnOrg(id);
    return this.conversion.convert(id, this.actor.requireActorId(), dto);
  }

  private async assertOwnOrg(id: string) {
    const own = await this.actor.requireOrgId();
    if (id !== own) throw new ForbiddenException('That is not your organisation.');
  }
}
