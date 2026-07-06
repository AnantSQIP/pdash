import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

class UpdateOrgDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.organization.findMany({
      select: { id: true, name: true, code: true, status: true },
    });
  }

  // Rename the organization. Gated on user.manage_access (org admins / super admins).
  @Patch(':id')
  @RequirePermission('user.manage_access')
  update(@Param('id') id: string, @Body() dto: UpdateOrgDto) {
    return this.prisma.organization.update({
      where: { id },
      data: { name: dto.name },
      select: { id: true, name: true, code: true, status: true },
    });
  }
}
