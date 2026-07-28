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

/** PID shape (org-agnostic): ORGCODE_YY_YY_serial. The service re-checks against the real org code. */
const PID_PATTERN = /^[A-Z0-9]+_\d{2}_\d{2}_\d{1,6}$/i;
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

// Task/project priority is a fixed set — free-text used to be stored verbatim.
export const PROJECT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
// The project lifecycle phases (free-text before — any string was accepted).
export const PROJECT_PHASES = ['IDEA', 'PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED'];

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

  /** Inline custom type (the "+ Create new type" option): a one-off type name + its task list.
   *  When `save` is true it is ALSO persisted as an org-wide reusable ProjectTemplate. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomTypeDto)
  customType?: CustomTypeDto;

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
   * The Project Manager who OWNS this project (becomes its MANAGER). Required for a requester
   * WITHOUT project.generate_pid; must be of equal-or-higher seniority than the creator. This is
   * separate from pidAssigneeId (the PID authority who assigns the Project ID).
   */
  @IsOptional()
  @IsString()
  managerId?: string;

  /**
   * A Project ID minted via the Generate PID action. Honored ONLY for users who hold
   * project.generate_pid (ignored otherwise). When such a user omits it, a fresh PID is
   * minted automatically. A user WITHOUT that permission never supplies a PID — they set
   * pidAssigneeId instead and the project is created with the PID pending.
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(40)
  @Matches(PID_PATTERN, { message: 'PID must look like SQ_YY_YY_NNN.' })
  pid?: string;

  /**
   * For a requester WITHOUT project.generate_pid: the authority they ask to assign the PID.
   * The project is created with a pending PID and a request is routed to this person.
   */
  @IsOptional()
  @IsString()
  pidAssigneeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(PROJECT_PRIORITIES)
  priority?: string;

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
}

// The PID reviewer's edit — everything they may verify/correct before attaching the PID,
// INCLUDING the project type and the project manager (which they set on the requester's behalf).
export class ReviewPidProjectDto {
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

  /** The project type — the reviewer picks it (drives the auto-created task template). */
  @IsOptional()
  @IsIn(PROJECT_TYPE_VALUES)
  projectType?: string;

  /** The project manager (userId) — the reviewer assigns the owner. */
  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  dueDate?: string | null;
}

export class FulfillPidDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(40)
  @Matches(PID_PATTERN, { message: 'PID must look like SQ_YY_YY_NNN.' })
  pid!: string;
}

export class AttachPidDto {
  // Optional: a specific (reserved/typed) PID to attach. Omitted → an auto-assigned serial.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(40)
  @Matches(PID_PATTERN, { message: 'PID must look like SQ_YY_YY_NNN.' })
  pid?: string;
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
