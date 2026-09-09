import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { TimeModeService, TIME_TRACKING_MODES, type TimeTrackingMode } from '../time-mode/time-mode.module';

class UpdateOrgDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsString() @MaxLength(9) brandColor?: string; // #RRGGBB
  /**
   * The firm's logo as an image data URL, or an empty string to remove it.
   *
   * Capped at the same 900 KB as a profile photo. The limit is not arbitrary: this column is read
   * with the org record on every page load, so a multi-megabyte logo would be re-sent to every
   * user on every navigation.
   */
  @IsOptional() @IsString() @MaxLength(900_000) logo?: string;
}

class SetTimeModeDto {
  @IsIn(TIME_TRACKING_MODES) mode!: TimeTrackingMode;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

const ORG_SELECT = {
  id: true, name: true, code: true, status: true, timezone: true, brandColor: true, logo: true,
  // Which of the two time-recording flows this firm uses. Sent with the org on every page load
  // because it decides what My Tasks even shows — a client that had to ask separately would
  // render the wrong set of buttons for a moment on every load.
  timeTrackingMode: true,
};

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeMode: TimeModeService,
    private readonly actor: ActorContextService,
  ) {}

  /**
   * Switch how the firm records time.
   *
   * Its own route rather than a field on the general update, because it is not a field: leaving
   * the stopwatch has to close every clock still running at that moment, and that settlement must
   * not be something a caller can skip by PATCHing a column. Gated like every other org-wide
   * change — the access permission AND the step-up passcode.
   */
  @Patch(':id/time-mode')
  @RequirePermission('user.manage_access')
  @RequirePasscode()
  async setTimeMode(@Param('id') id: string, @Body() dto: SetTimeModeDto) {
    const result = await this.timeMode.switchMode(id, dto.mode, this.actor.requireActorId(), dto.note);
    return { ...result, organizationId: id };
  }

  /** Every switch this firm has made — how a report over an older window is read. */
  @Get(':id/time-mode/history')
  @RequirePermission('user.manage_access')
  history(@Param('id') id: string) {
    return this.timeMode.history(id);
  }

  @Get()
  list() {
    return this.prisma.organization.findMany({ select: ORG_SELECT });
  }

  // Update org general settings. Gated on user.manage_access (org admins / super
  // admins) and, as an org-level "big change", also the step-up passcode.
  @Patch(':id')
  @RequirePermission('user.manage_access')
  @RequirePasscode()
  update(@Param('id') id: string, @Body() dto: UpdateOrgDto) {
    let logo: string | null | undefined;
    if (dto.logo !== undefined) {
      const value = dto.logo.trim();
      // Only an image, and only ever inline. A URL here would let the settings page point the
      // whole organisation's branding at a third-party host that then sees every page load.
      if (value && !value.startsWith('data:image/')) {
        throw new BadRequestException('The logo must be an image file.');
      }
      logo = value || null;
    }
    return this.prisma.organization.update({
      where: { id },
      // `undefined` leaves a column alone in Prisma; `null` clears it. That distinction is what
      // lets one route both set and remove the logo without a second endpoint.
      data: { name: dto.name, timezone: dto.timezone, brandColor: dto.brandColor, logo },
      select: ORG_SELECT,
    });
  }
}
