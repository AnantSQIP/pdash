import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

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

  // Deprecated/ignored — the creator is taken from the verified cookie actor.
  // Kept optional so legacy clients that still send it are not rejected.
  @IsOptional()
  @IsString()
  createdBy?: string;

  /**
   * The project manager who owns this project and APPROVES it. Required when the
   * requester cannot approve projects themselves (e.g. an Employee/intern raising a
   * project request); defaults to the requester when they can approve.
   */
  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
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

export class ApprovalDto {
  // Deprecated/ignored — the approver is the verified cookie actor.
  @IsOptional()
  @IsString()
  actingUserId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
