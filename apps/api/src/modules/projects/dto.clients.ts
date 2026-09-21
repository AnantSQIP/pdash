/**
 * The CLIENTS flow's project DTOs (see projects.clients.service.ts). dto.ts holds the PROJECTS
 * flow's, production's as they stood at bb5728b. Kept apart because the two flows accept different
 * bodies on the same routes, and the controller validates each body against its own flow's class.
 */
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** CID shape (org-agnostic): PREFIX_YY_YY_serial. The service re-checks against the org's prefix. */
const CID_PATTERN = /^[A-Z0-9]+_\d{2}_\d{2}_\d{1,6}$/i;
import { Transform, Type } from 'class-transformer';
import { PROJECT_TYPE_VALUES } from './project-templates';

/** Inline custom project type — a name + task list, optionally saved as an org-wide template. */
export class CustomTypeDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tasks?: string[];

  /** true = also persist this as a reusable org-wide ProjectTemplate. */
  @IsOptional()
  @IsBoolean()
  save?: boolean;
}

/** A technology domain somebody typed instead of picking. `save` adds it to the org's list. */
export class CustomDomainDto {
  @IsOptional() @IsString() @MaxLength(60)
  label?: string;

  @IsOptional() @IsBoolean()
  save?: boolean;
}

/**
 * CLIENTS-FLOW. One piece of work for a client: what to call it, what kind of work it is (whose
 * standard tasks are created inside it), its field, its dates — and, optionally, who does it.
 *
 * Shared by "create a client" (its first group) and "add a task group", so the two doors cannot
 * accept different things.
 */
export class TaskGroupSpecDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  /** A project-type value (built-in or saved) — its standard tasks are created in the group. */
  @IsOptional() @IsString() @MaxLength(60)
  groupType?: string;

  @IsOptional() @ValidateNested() @Type(() => CustomTypeDto)
  customType?: CustomTypeDto;

  @IsOptional() @IsString() @MaxLength(60)
  technologyDomain?: string;

  @IsOptional() @ValidateNested() @Type(() => CustomDomainDto)
  customDomain?: CustomDomainDto;

  @IsOptional() @IsDateString() @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  @IsOptional() @IsDateString() @Transform(({ value }) => (value === '' ? null : value))
  dueDate?: string | null;

  /** The date promised to the client for this piece of work. Restricted (deadline.view.client). */
  @IsOptional() @IsDateString() @Transform(({ value }) => (value === '' ? null : value))
  clientDueDate?: string | null;

  /**
   * Who does the group's standard tasks. Needs task.assign; creates a real staffing seat on each
   * task, which is what makes the work appear on Team Capacity.
   */
  @IsOptional() @IsString() @MaxLength(40)
  assigneeId?: string;

  /** Planned hours per task for that person. Optional — a seat may carry no estimate yet. */
  @IsOptional() @Type(() => Number) @Min(0) @Max(200)
  hoursPerTask?: number;
}

// Task/project priority is a fixed set — free-text used to be stored verbatim.
export const PROJECT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
// The project lifecycle phases (free-text before — any string was accepted).
export const OFFICES = ['GURGAON', 'JAIPUR'];
// No CLOSED. Marking a project complete IS the end of it — a second "close" step said nothing the
// first had not already said, and left two states meaning the same thing in every module.
// Legacy CLOSED rows are migrated to COMPLETED; read paths still tolerate the value.
export const PROJECT_PHASES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'CANCELLED'];

export class CreateProjectDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  /** The kind of matter — a built-in type value OR a saved custom-template value. Drives the
   *  auto-created task template. Not restricted to the built-ins any more (org templates add more). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  projectType?: string;

  /** Technology domain slug — a built-in or one this org saved. */
  @IsOptional() @IsString() @MaxLength(60)
  technologyDomain?: string;

  /** Inline custom type (the "+ Create new type" option): a one-off type name + its task list.
   *  When `save` is true it is ALSO persisted as an org-wide reusable ProjectTemplate. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomTypeDto)
  customType?: CustomTypeDto;

  @IsOptional() @ValidateNested() @Type(() => CustomDomainDto)
  customDomain?: CustomDomainDto;

  /** CLIENTS-FLOW: file the new client under this client group. */
  @IsOptional() @IsString() @MaxLength(40)
  clientGroupId?: string;

  /** CLIENTS-FLOW: the client's first task group. When sent, it replaces the project-level type. */
  @IsOptional() @ValidateNested() @Type(() => TaskGroupSpecDto)
  taskGroup?: TaskGroupSpecDto;

  /** The client/matter (drives the "{Type} - {Client}" title + the confidential patent picker). */
  @IsOptional()
  @IsString()
  clientId?: string;

  /** Patent handles (Pat_MLK_*) to link — chosen from the selected client's confidential set. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  patentIds?: string[];

  // Deprecated/ignored — the creator is taken from the verified cookie actor.
  // Kept optional so legacy clients that still send it are not rejected.
  @IsOptional()
  @IsString()
  createdBy?: string;

  /**
   * Who manages the client (becomes its MANAGER). Optional: blank means the creator. There is no
   * CID field — every client is given its CID automatically, in the transaction that creates it.
   */
  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(PROJECT_PRIORITIES)
  priority?: string;

  /**
   * The office that owns this matter (GURGAON | JAIPUR). Defaults to the creator's own office.
   */
  @IsOptional()
  @IsIn(OFFICES)
  office?: string;

  // An emptied form field submits "", which @IsDateString would reject with a 400. Treat it
  // as "not supplied" so leaving an optional date blank just omits it.
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  /** INTERNAL deadline — visible to everyone. */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  dueDate?: string | null;

  /** CLIENT deadline — restricted (requires deadline.view.client). */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  clientDueDate?: string | null;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(PROJECT_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(PROJECT_PHASES)
  projectPhase?: string;

  // `null` is meaningful on these three: it CLEARS the date. @IsOptional() lets null through
  // validation, and the service distinguishes it from "field not sent".
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  /** INTERNAL deadline. */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  dueDate?: string | null;

  /** CLIENT deadline — restricted. */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  clientDueDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercentage?: number;

  /** CLIENTS-FLOW: move the client into a group; null takes it out of any group. */
  @IsOptional() @IsString() @MaxLength(40)
  clientGroupId?: string | null;
}

/**
 * Where a client's CID should move to.
 *
 * WHICH of the three corrections this is — reassign, split or merge — comes from the ROUTE, never
 * from the body: the operation decides which refusals apply ("you cannot split a client that is
 * already alone under its CID"), and a field the caller could set would let them ask for one
 * operation and be given another.
 *
 * Both fields are optional and at most one is meaningful:
 *   · neither — issue the next CID in the current financial year (reassign / split).
 *   · `cid`   — an existing CID that holds live work, typed (merge only; a CID is never re-used).
 *   · `intoProjectId` — the merge picker, which names a CLIENT because that is what the person
 *     doing this is looking at. The service reads that client's CID.
 */
export class MoveCidDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(40)
  @Matches(CID_PATTERN, { message: 'CID must look like SQ_YY_YY_NNN.' })
  cid?: string;

  /** The client to merge this one under — its CID is the destination. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  intoProjectId?: string;
}

export class ApprovalDto {
  // Deprecated/ignored — the approver is the verified cookie actor.
  @IsOptional()
  @IsString()
  actingUserId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * A NEW CLIENT UNDER AN EXISTING CID — the returning-client flow.
 *
 * Deliberately smaller than CreateProjectDto: the CID, the client and the office are inherited
 * from the round before it, so they are never asked for again and cannot be contradicted here.
 * What genuinely changes for a second piece of work is the name, the kind of work, when it runs,
 * who staffs it, and how urgent it is.
 */
export class AddProjectRoundDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  projectType?: string;

  /** Technology domain slug — a built-in or one this org saved. */
  @IsOptional() @IsString() @MaxLength(60)
  technologyDomain?: string;

  /** Inline one-off custom type, same shape as project creation. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomTypeDto)
  customType?: CustomTypeDto;

  @IsOptional() @ValidateNested() @Type(() => CustomDomainDto)
  customDomain?: CustomDomainDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(PROJECT_PRIORITIES)
  priority?: string;

  /** Lifecycle phase to start in — usually ACTIVE, but a round can be planned ahead. */
  @IsOptional()
  @IsIn(PROJECT_PHASES)
  projectPhase?: string;

  /** When the round starts. */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  /** When the round is expected to finish. Stored as the project's due date. */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  endDate?: string | null;

  /** CLIENT deadline — restricted, same rule as creating a project. */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  clientDueDate?: string | null;

  /** Who staffs THIS round. Empty = just the creator, as its manager. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoundMemberDto)
  members?: RoundMemberDto[];
}

export class RoundMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  projectRole?: string;
}

/**
 * The COMPLETE set of patents a project should be tagged with — not a delta. An empty array
 * therefore means "no patents", and is the way to clear a mistagged project.
 */
export class SetProjectPatentsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  patentIds?: string[];
}

/**
 * The client a project is for, named directly. `null` detaches it.
 * Only accepted while the project has no tagged patents — see ProjectsService.setClient.
 */
export class SetProjectClientDto {
  @IsOptional()
  @IsString()
  clientId?: string | null;
}


