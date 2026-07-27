import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// The task-staffing roles: one Project Manager, many Reviewers, many Analysts.
export const TASK_ASSIGNEE_ROLES = ['PM', 'REVIEWER', 'ANALYST'];

// Task priority is a fixed set — free-text used to be stored verbatim (incl. markup).
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export class CreateTaskDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  projectId!: string;

  @IsString()
  taskListId!: string;

  // Deprecated/ignored — the creator is taken from the verified cookie actor.
  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsString()
  currentWorkflowStatusId?: string;

  // `null` is meaningful on these three: it CLEARS the date. @IsOptional() lets null through
  // validation, and the service distinguishes it from "field not sent".
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  /** INTERNAL deadline — what the assignee works to; drives "overdue". */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  dueDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  estimatedHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}

export class UpdateTaskDto {
  // Trim + require ≥1 char, mirroring CreateTaskDto — a PATCH could otherwise blank the title
  // ({title:""} or whitespace), leaving an empty heading / table cell / kanban card / a11y label.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  completionPercentage?: number;

  // On an UPDATE, `null` (or an emptied form field, "") CLEARS the date; omitting the field
  // leaves it alone. @IsOptional() lets null through, and the service distinguishes the two.
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  startDate?: string | null;

  /** INTERNAL deadline. */
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => (value === '' ? null : value))
  dueDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  estimatedHours?: number;
}

export class SetStatusDto {
  @IsString()
  statusId!: string;
}

export class SetAssigneesDto {
  @IsArray()
  @IsString({ each: true })
  assigneeIds!: string[];
}

export class StaffingEntryDto {
  @IsString()
  userId!: string;

  @IsIn(TASK_ASSIGNEE_ROLES)
  role!: string;

  // Per-person estimated hours — mandatory (the task total is their sum).
  @IsNumber()
  @Min(0.25)
  @Max(1000)
  estimatedHours!: number;
}

export class SetStaffingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffingEntryDto)
  assignees!: StaffingEntryDto[];
}

export class CreateSubtaskDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}
