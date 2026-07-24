import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTimesheetDto {
  // IGNORED by the server — the owner is derived from the authenticated actor.
  // Kept (optional) only so existing clients that still send it don't trip
  // forbidNonWhitelisted validation. Do not rely on it.
  @IsOptional()
  @IsString()
  userId?: string;

  // OPTIONAL: the task determines the project (PID) + type. Omitting it logs a "buffer" entry
  // that must have its PID (task) assigned within a week.
  @IsString()
  @IsOptional()
  taskId?: string;

  @IsDateString()
  date!: string;

  @IsNumber()
  @Min(0.25)
  @Max(24)
  hoursLogged!: number;

  @IsBoolean()
  @IsOptional()
  billable?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}

export class AssignTimesheetDto {
  // The task whose project (PID) + type this buffer entry should be assigned to.
  @IsString()
  taskId!: string;
}

export class UpdateTimesheetDto {
  @IsNumber()
  @Min(0.25)
  @Max(24)
  @IsOptional()
  hoursLogged?: number;

  @IsBoolean()
  @IsOptional()
  billable?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
