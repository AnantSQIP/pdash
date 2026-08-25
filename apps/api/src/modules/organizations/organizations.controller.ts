import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';

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

const ORG_SELECT = {
  id: true, name: true, code: true, status: true, timezone: true, brandColor: true, logo: true,
};

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

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
