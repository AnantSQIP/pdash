import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Put,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { ActorContextService } from '../../common/context/actor-context.service';
import { EventService } from '../audit-events/event.service';
import { EVENTS } from '../../common/events/canonical-events';
import { UpdateProfileDto } from './dto';

/** Directory fields — who someone is at work. Managers and seniors may see these. */
const DIRECTORY_SELECT = {
  id: true, firstName: true, lastName: true, email: true, phone: true,
  designation: true, employeeCode: true, joiningDate: true, profilePhoto: true,
  status: true, profileCompletedAt: true,
  departmentMemberships: { select: { department: { select: { id: true, name: true } } }, take: 1 },
} as const;

/**
 * The PERSONAL tier. Present in a response ONLY for holders of profile.view.personal
 * (Admin, Super Admin, HR) or the person themselves. Listed explicitly so adding a field to
 * UserProfile can never silently widen what a manager receives — a new column is invisible
 * until it is named here.
 */
const PERSONAL_FIELDS = [
  'dateOfBirth', 'gender', 'bloodGroup', 'maritalStatus', 'nationality',
  'personalEmail', 'alternatePhone',
  'currentLine1', 'currentLine2', 'currentCity', 'currentState', 'currentPostalCode', 'currentCountry',
  'permanentSameAsCurrent', 'permanentLine1', 'permanentLine2', 'permanentCity',
  'permanentState', 'permanentPostalCode', 'permanentCountry',
  'emergencyName', 'emergencyRelationship', 'emergencyPhone',
] as const;

export interface ProfileScope {
  self: boolean;
  directory: boolean;
  personal: boolean;
  editAny: boolean;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly actor: ActorContextService,
    private readonly events: EventService,
  ) {}

  /** What may this actor see of THIS person? Looking at yourself always grants everything. */
  async scopeFor(targetUserId: string): Promise<ProfileScope> {
    const actorId = this.actor.requireActorId();
    const self = actorId === targetUserId;
    const [directory, personal, editAny] = await Promise.all([
      this.permissions.check(actorId, 'profile.view'),
      this.permissions.check(actorId, 'profile.view.personal'),
      this.permissions.check(actorId, 'profile.update.any'),
    ]);
    return { self, directory: self || directory, personal: self || personal, editAny };
  }

  /**
   * A person's profile, redacted to what this actor may see.
   *
   * Redaction is by DELETING keys, not by blanking them: an unauthorised caller's JSON has
   * no `currentLine1` key at all, so there is nothing to accidentally render, log or cache.
   */
  async get(targetUserId: string) {
    const scope = await this.scopeFor(targetUserId);
    if (!scope.directory) {
      // Don't reveal whether the person exists to someone with no business looking.
      throw new ForbiddenException('You do not have permission to view this profile.');
    }

    const organizationId = await this.actor.requireOrgId();
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId, deletedAt: null },
      select: { ...DIRECTORY_SELECT, profile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const { departmentMemberships, profile, ...directory } = user as any;
    const out: Record<string, unknown> = {
      ...directory,
      department: departmentMemberships?.[0]?.department ?? null,
      profileCompleted: !!directory.profileCompletedAt,
      canSeePersonal: scope.personal,
      canEdit: scope.self || scope.editAny,
    };
    delete out.profileCompletedAt;

    if (scope.personal && profile) {
      for (const f of PERSONAL_FIELDS) out[f] = (profile as any)[f] ?? null;
    } else if (scope.personal) {
      // Allowed to see it, but they haven't filled it in yet.
      for (const f of PERSONAL_FIELDS) out[f] = null;
    }
    // Not allowed → the keys are simply absent.
    return out;
  }

  /** Write a profile. `targetUserId` may only differ from the actor with profile.update.any. */
  async update(targetUserId: string, dto: UpdateProfileDto) {
    const scope = await this.scopeFor(targetUserId);
    if (!scope.self && !scope.editAny) {
      throw new ForbiddenException('You may only edit your own profile.');
    }
    const organizationId = await this.actor.requireOrgId();
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId, deletedAt: null },
      select: {
        id: true, phone: true, profileCompletedAt: true,
        profile: {
          select: {
            dateOfBirth: true, currentLine1: true, currentCity: true, currentState: true,
            currentPostalCode: true, permanentSameAsCurrent: true, permanentLine1: true,
            emergencyName: true, emergencyRelationship: true, emergencyPhone: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const { phone, ...personal } = dto;
    // A permanent address marked "same as current" is stored resolved, so every reader gets
    // a real address rather than having to know about the flag.
    const data: Record<string, unknown> = { ...personal };
    if (dto.permanentSameAsCurrent) {
      data.permanentLine1 = dto.currentLine1 ?? null;
      data.permanentLine2 = dto.currentLine2 ?? null;
      data.permanentCity = dto.currentCity ?? null;
      data.permanentState = dto.currentState ?? null;
      data.permanentPostalCode = dto.currentPostalCode ?? null;
      data.permanentCountry = dto.currentCountry ?? null;
    }
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }

    // ── Gate enforcement (root fix) ──────────────────────────────────────────
    // The first-login gate must clear ONLY when the required joining details are all present
    // and valid. A field the DTO leaves undefined keeps its stored value, so an HR correction
    // that touches one field never wipes the gate. This is server-side; the client checks too.
    const existing = user.profile;
    const merged = {
      phone: dto.phone !== undefined ? dto.phone : user.phone,
      dateOfBirth: dto.dateOfBirth !== undefined ? dto.dateOfBirth : (existing?.dateOfBirth ?? null),
      currentLine1: dto.currentLine1 !== undefined ? dto.currentLine1 : existing?.currentLine1,
      currentCity: dto.currentCity !== undefined ? dto.currentCity : existing?.currentCity,
      currentState: dto.currentState !== undefined ? dto.currentState : existing?.currentState,
      currentPostalCode: dto.currentPostalCode !== undefined ? dto.currentPostalCode : existing?.currentPostalCode,
      emergencyName: dto.emergencyName !== undefined ? dto.emergencyName : existing?.emergencyName,
      emergencyRelationship: dto.emergencyRelationship !== undefined ? dto.emergencyRelationship : existing?.emergencyRelationship,
      emergencyPhone: dto.emergencyPhone !== undefined ? dto.emergencyPhone : existing?.emergencyPhone,
    };
    const sameAsCurrent = dto.permanentSameAsCurrent !== undefined
      ? dto.permanentSameAsCurrent : existing?.permanentSameAsCurrent;
    const permanentLine1 = dto.permanentLine1 !== undefined ? dto.permanentLine1 : existing?.permanentLine1;

    const REQUIRED: [string, unknown][] = [
      ['work phone', merged.phone], ['date of birth', merged.dateOfBirth],
      ['current address', merged.currentLine1], ['city', merged.currentCity],
      ['state', merged.currentState], ['PIN code', merged.currentPostalCode],
      ['emergency contact name', merged.emergencyName],
      ['emergency contact relationship', merged.emergencyRelationship],
      ['emergency contact phone', merged.emergencyPhone],
    ];
    if (!sameAsCurrent) REQUIRED.push(['permanent address', permanentLine1]);
    const missing = REQUIRED.filter(([, v]) => !String(v ?? '').trim()).map(([label]) => label);

    // DOB sanity: validate ONLY when it's being set/changed in this request — never re-validate
    // an unchanged stored value, or a legacy bad DOB would block every unrelated edit. A real
    // past date, plausible working age (15–100).
    if (dto.dateOfBirth) {
      const dob = new Date(dto.dateOfBirth);
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now() || age < 15 || age > 100) {
        throw new BadRequestException('Enter a valid date of birth.');
      }
    }

    const isComplete = missing.length === 0;
    // First-login self-completion must actually be complete — never let a partial submit slip
    // the gate open with an empty record.
    if (scope.self && !user.profileCompletedAt && !isComplete) {
      throw new BadRequestException(`Please fill in every required field: ${missing.join(', ')}.`);
    }
    // Stamp the gate only when complete; never un-complete an already-completed profile.
    const profileCompletedAt = isComplete ? (user.profileCompletedAt ?? new Date()) : user.profileCompletedAt;

    await this.prisma.$transaction(async (tx) => {
      await tx.userProfile.upsert({
        where: { userId: targetUserId },
        create: { userId: targetUserId, ...(data as any) },
        update: data as any,
      });
      // The work phone lives on User (it is directory data, not private).
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          ...(phone !== undefined ? { phone: phone || null } : {}),
          profileCompletedAt,
        },
      });
    });

    // Audited, but the VALUES are never logged — an audit trail of home addresses would
    // recreate the very exposure this table is designed to prevent.
    await this.events.emit({
      action: EVENTS.USER_UPDATED,
      entityType: 'User',
      entityId: targetUserId,
      organizationId,
      metadata: { op: 'profile-update', bySelf: scope.self, fields: Object.keys(dto) },
    });

    return this.get(targetUserId);
  }
}

@Controller('profile')
class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly actor: ActorContextService,
  ) {}

  /** Your own profile — always fully visible to you, no permission needed. */
  @Get('me')
  async me() {
    return this.profile.get(this.actor.requireActorId());
  }

  /** Fill in / update your own profile. This is what clears the first-sign-in gate. */
  @Put('me')
  async updateMe(@Body() dto: UpdateProfileDto) {
    return this.profile.update(this.actor.requireActorId(), dto);
  }

  /**
   * Someone else's profile. The permission check is inside the service, because what comes
   * back depends on WHICH tier the actor holds — a route-level guard cannot express that.
   */
  @Get(':userId')
  get(@Param('userId') userId: string) {
    return this.profile.get(userId);
  }

  /** Correct someone's details (HR/Admin) — requires profile.update.any. */
  @Put(':userId')
  update(@Param('userId') userId: string, @Body() dto: UpdateProfileDto) {
    return this.profile.update(userId, dto);
  }
}

@Module({
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
