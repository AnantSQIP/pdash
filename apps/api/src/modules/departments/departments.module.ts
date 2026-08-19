import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ActorContextService } from '../../common/context/actor-context.service';
import { serialize, departmentKeyFor } from '../../common/db/serialize';

class CreateDepartmentDto {
  // Ignored — the org is always taken from the session (never the client body).
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class AddDepartmentMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleInDepartment?: string;
}

class SetHeadDto {
  /** null / omitted clears the head. */
  @IsOptional()
  @IsString()
  userId?: string | null;
}

/** Selected on every read, so the shape is identical wherever a member appears. */
const MEMBER_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  designation: true,
  status: true,
  profilePhoto: true,
} as const;

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Departments with their members and head.
   *
   * Soft-deleted people are excluded. They used not to be, so somebody offboarded stayed on the
   * department card and in its member count indefinitely — the list was showing the roster as it
   * had been, not as it is.
   */
  async list(organizationId: string) {
    const rows = await this.prisma.department.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        head: { select: MEMBER_USER_SELECT },
        members: {
          where: { user: { deletedAt: null } },
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: MEMBER_USER_SELECT } },
        },
      },
    });
    return rows.map(({ members, head, ...d }) => ({
      ...d,
      memberCount: members.length,
      members: members.map(m => ({ ...m.user, roleInDepartment: m.roleInDepartment, joinedAt: m.joinedAt })),
      // From headUserId only. It was previously guessed with a regex over free text — see the
      // schema comment on Department.headUserId for why that had to go.
      head: head ?? null,
    }));
  }

  /** A department must belong to the actor's org — blocks cross-tenant id access. */
  private async assertDeptInOrg(departmentId: string, organizationId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId } });
    if (!dept) throw new NotFoundException(`Department ${departmentId} not found`);
    return dept;
  }

  /**
   * Rejects a name already in use, case-insensitively.
   *
   * The database has a unique index too — this exists so the answer is a 409 explaining which name
   * clashed, rather than a Prisma constraint error surfacing as a 500.
   */
  private async assertNameFree(
    organizationId: string, name: string, exceptId?: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const clash = await tx.department.findFirst({
      where: {
        organizationId,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) throw new ConflictException(`A department called "${clash.name}" already exists.`);
  }

  async create(organizationId: string, dto: CreateDepartmentDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('A department needs a name.');
    // Name check and insert together. Apart, they raced: six simultaneous requests whose names
    // differed only in capitals produced four departments, because the application check is
    // case-insensitive while the database index is not, so nothing caught what slipped between.
    return serialize(this.prisma, departmentKeyFor(organizationId), async tx => {
      await this.assertNameFree(organizationId, name, undefined, tx);
      return tx.department.create({
        data: { organizationId, name, description: dto.description?.trim() || null },
      });
    });
  }

  async update(organizationId: string, departmentId: string, dto: UpdateDepartmentDto) {
    await this.assertDeptInOrg(departmentId, organizationId);
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('A department needs a name.');
    // A rename can collide exactly as a create can, so it takes the same lock.
    return serialize(this.prisma, departmentKeyFor(organizationId), async tx => {
      if (name) await this.assertNameFree(organizationId, name, departmentId, tx);
      return tx.department.update({
        where: { id: departmentId },
        data: {
          ...(name ? { name } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        },
      });
    });
  }

  /**
   * Deletes a department.
   *
   * Refuses while projects are still attached. Members cascade away — a membership means nothing
   * once the department is gone — but a project pointing at a department is somebody's reporting
   * line through the analytics, and silently dropping it would leave that work unattributed.
   */
  async remove(organizationId: string, departmentId: string) {
    await this.assertDeptInOrg(departmentId, organizationId);
    const projects = await this.prisma.projectDepartment.count({ where: { departmentId } });
    if (projects > 0) {
      throw new ConflictException(
        `This department is attached to ${projects} project${projects === 1 ? '' : 's'}. Detach it there first.`,
      );
    }
    await this.prisma.department.delete({ where: { id: departmentId } });
    return { ok: true };
  }

  async listMembers(organizationId: string, departmentId: string) {
    await this.assertDeptInOrg(departmentId, organizationId);
    return this.prisma.departmentMember.findMany({
      where: { departmentId, user: { deletedAt: null } },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(organizationId: string, departmentId: string, dto: AddDepartmentMemberDto) {
    const dept = await this.assertDeptInOrg(departmentId, organizationId);

    // The member must belong to the same organization as the department.
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: dept.organizationId, deletedAt: null },
    });
    if (!user) throw new BadRequestException(`User ${dto.userId} is not in this organization`);

    // Checked rather than left to the unique index, so a second add reads as "already a member"
    // instead of a Prisma constraint error surfacing as a 500. Inside the lock so that two
    // simultaneous adds cannot both find nothing — the index would catch it, but as a 500.
    return serialize(this.prisma, `deptmem:${departmentId}`, async tx => {
      const already = await tx.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId, userId: dto.userId } },
        select: { id: true },
      });
      if (already) {
        throw new ConflictException(`${user.firstName} is already in this department.`);
      }
      return tx.departmentMember.create({
        data: { departmentId, userId: dto.userId, roleInDepartment: dto.roleInDepartment?.trim() || null },
        include: { user: { select: MEMBER_USER_SELECT } },
      });
    });
  }

  /** Change someone's role WITHIN the department (Deputy, Coordinator…). Not the head — see setHead. */
  async updateMember(organizationId: string, departmentId: string, userId: string, roleInDepartment?: string) {
    await this.assertDeptInOrg(departmentId, organizationId);
    const member = await this.prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException(`Member ${userId} not found in department ${departmentId}`);
    return this.prisma.departmentMember.update({
      where: { departmentId_userId: { departmentId, userId } },
      data: { roleInDepartment: roleInDepartment?.trim() || null },
      include: { user: { select: MEMBER_USER_SELECT } },
    });
  }

  /**
   * Removes a member, and clears the head if it was them.
   *
   * Both writes go in one transaction. Separately, a failure between them would leave a department
   * headed by somebody who is no longer in it — which is the exact state the head column exists to
   * make impossible.
   */
  async removeMember(organizationId: string, departmentId: string, userId: string) {
    const dept = await this.assertDeptInOrg(departmentId, organizationId);
    const member = await this.prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
    });
    if (!member) throw new NotFoundException(`Member ${userId} not found in department ${departmentId}`);

    await this.prisma.$transaction(async tx => {
      await tx.departmentMember.delete({ where: { departmentId_userId: { departmentId, userId } } });
      if (dept.headUserId === userId) {
        await tx.department.update({ where: { id: departmentId }, data: { headUserId: null } });
      }
    });
    return { ok: true, headCleared: dept.headUserId === userId };
  }

  /**
   * Sets or clears the head.
   *
   * The head must already be a member. Heading a department you are not in is not a state anyone
   * would choose deliberately, and allowing it would put the card in the odd position of naming
   * somebody who does not appear in the list underneath it.
   */
  async setHead(organizationId: string, departmentId: string, userId?: string | null) {
    await this.assertDeptInOrg(departmentId, organizationId);
    if (userId) {
      const member = await this.prisma.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
        select: { id: true },
      });
      if (!member) {
        throw new BadRequestException('The head must be a member of the department. Add them first.');
      }
    }
    return this.prisma.department.update({
      where: { id: departmentId },
      data: { headUserId: userId ?? null },
      include: { head: { select: MEMBER_USER_SELECT } },
    });
  }
}

@Controller('departments')
class DepartmentsController {
  constructor(
    private readonly service: DepartmentsService,
    private readonly actor: ActorContextService,
  ) {}

  @Get() @RequirePermission('department.view')
  async list() {
    return this.service.list(await this.actor.requireOrgId());
  }

  @Post() @RequirePermission('department.create')
  async create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(await this.actor.requireOrgId(), dto);
  }

  @Patch(':id') @RequirePermission('department.update')
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(await this.actor.requireOrgId(), id, dto);
  }

  @Delete(':id') @RequirePermission('department.delete')
  async remove(@Param('id') id: string) {
    return this.service.remove(await this.actor.requireOrgId(), id);
  }

  @Get(':id/members') @RequirePermission('department.view')
  async listMembers(@Param('id') id: string) {
    return this.service.listMembers(await this.actor.requireOrgId(), id);
  }

  @Post(':id/members') @RequirePermission('department.update')
  async addMember(@Param('id') id: string, @Body() dto: AddDepartmentMemberDto) {
    return this.service.addMember(await this.actor.requireOrgId(), id, dto);
  }

  @Patch(':id/members/:userId') @RequirePermission('department.update')
  async updateMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: AddDepartmentMemberDto,
  ) {
    return this.service.updateMember(await this.actor.requireOrgId(), id, userId, dto.roleInDepartment);
  }

  @Delete(':id/members/:userId') @RequirePermission('department.update')
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.removeMember(await this.actor.requireOrgId(), id, userId);
  }

  @Patch(':id/head') @RequirePermission('department.update')
  async setHead(@Param('id') id: string, @Body() dto: SetHeadDto) {
    return this.service.setHead(await this.actor.requireOrgId(), id, dto.userId ?? null);
  }
}

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
