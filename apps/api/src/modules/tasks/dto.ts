import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTaskDto {
  @IsString()
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
  description?: string;

  @IsOptional()
  @IsString()
  milestoneId?: string;

  @IsOptional()
  @IsString()
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
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
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

export class CreateSubtaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}
