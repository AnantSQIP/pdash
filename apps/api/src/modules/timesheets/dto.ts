import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  // OPTIONAL entry kinds. Omitted for a normal task entry.
  //   OTHER       — miscellaneous non-project time (admin, internal meetings, training).
  //                 Always non-billable, never a PID buffer to assign.
  //   CLIENT_CALL — a call with a client, booked straight to a PID. It needs no task, no
  //                 assignment to one, and works whether the matter is open or finished:
  //                 clients ring about work that closed last month, and that time is real.
  @IsIn(['OTHER', 'CLIENT_CALL'])
  @IsOptional()
  category?: string;

  // Required for CLIENT_CALL: which PID the call was about. A call belongs to a matter even
  // though it belongs to no task within it.
  @IsString()
  @IsOptional()
  projectId?: string;

  // A short label for the entry — required for "OTHER" and "CLIENT_CALL" time (neither has a
  // task to take its name from), ignored for normal task/buffer entries.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsDateString()
  date!: string;

  @IsNumber()
  @Min(0.25)
  @Max(16) // hard daily cap — see MAX_HOURS_PER_DAY in timesheets.service
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
  @Max(16) // hard daily cap — see MAX_HOURS_PER_DAY in timesheets.service
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
