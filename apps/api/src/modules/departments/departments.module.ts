import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

class CreateDepartmentDto {
  @IsString()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class AddDepartmentMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  roleInDepartment?: string;
}

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    // L22 + #5: return real members (for avatars) and a real head (the member whose
    // roleInDepartment reads as head/lead/manager) — not a designation-string bucket
    // with members[0] labelled "Head".
    const rows = await this.prisma.department.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true } },
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });
    return rows.map(({ _count, members, ...d }) => ({
      ...d,
      memberCount: _count.members,
      members: members.map(m => ({ ...m.user, roleInDepartment: m.roleInDepartment })),
      head: members.find(m => /head|lead|manager/i.test(m.roleInDepartment ?? ''))?.user ?? null,
    }));
  }

  create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: {
        organizationId: dto.organizationId,
        name: dto.name,
        description: dto.description ?? null,
      },
    });
  }

  async listMembers(departmentId: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException(`Department ${departmentId} not found`);

    return this.prisma.departmentMember.findMany({
      where: { departmentId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            designation: true,
            email: true,
            status: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(departmentId: string, dto: AddDepartmentMemberDto) {
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException(`Department ${departmentId} not found`);

    // The member must belong to the same organization as the department.
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: dept.organizationId, deletedAt: null },
    });
    if (!user) throw new BadRequestException(`User ${dto.userId} is not in this organization`);

    return this.prisma.departmentMember.create({
      data: {
        departmentId,
        userId: dto.userId,
        roleInDepartment: dto.roleInDepartment ?? null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, designation: true } },
      },
    });
  }

  async removeMember(departmentId: string, userId: string) {
    const member = await this.prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
    });
    if (!member) throw new NotFoundException(`Member ${userId} not found in department ${departmentId}`);

    return this.prisma.departmentMember.delete({
      where: { departmentId_userId: { departmentId, userId } },
    });
  }
}

@Controller('departments')
class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  list(@Query('organizationId') organizationId: string) {
    return this.service.list(organizationId);
  }

  @Post() @RequirePermission('department.create')
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(dto);
  }

  @Get(':id/members')
  listMembers(@Param('id') id: string) {
    return this.service.listMembers(id);
  }

  @Post(':id/members') @RequirePermission('department.update')
  addMember(@Param('id') id: string, @Body() dto: AddDepartmentMemberDto) {
    return this.service.addMember(id, dto);
  }

  @Delete(':id/members/:userId') @RequirePermission('department.update')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.removeMember(id, userId);
  }
}

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
