import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTeamDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Who is in it from the start. The creator is always included regardless. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class TeamMemberDto {
  @IsString()
  userId!: string;
}

/** The COMPLETE membership, not a delta — same idempotent shape as project patent tagging. */
export class SetTeamMembersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class CreateTeamListDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class UpdateTeamListDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;
}

export class CreateTeamTaskDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  taskListId!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: string;

  @IsOptional() @IsString()
  startDate?: string;

  @IsOptional() @IsString()
  dueDate?: string;

  @IsOptional() @IsNumber() @Min(0)
  estimatedHours?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  assigneeIds?: string[];
}

export class MoveTeamTaskDto {
  @IsString()
  taskListId!: string;

  @IsOptional() @IsInt() @Min(0)
  sequence?: number;
}
