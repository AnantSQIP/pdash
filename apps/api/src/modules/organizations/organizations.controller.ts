import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequirePasscode } from '../../common/decorators/require-passcode.decorator';

class UpdateOrgDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsString() @MaxLength(9) brandColor?: string; // #RRGGBB
}

const ORG_SELECT = { id: true, name: true, code: true, status: true, timezone: true, brandColor: true };

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
    return this.prisma.organization.update({
      where: { id },
      data: { name: dto.name, timezone: dto.timezone, brandColor: dto.brandColor },
      select: ORG_SELECT,
    });
  }
}
