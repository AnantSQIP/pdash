import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateTimesheetDto {
  // IGNORED by the server — the owner is derived from the authenticated actor.
  // Kept (optional) only so existing clients that still send it don't trip
  // forbidNonWhitelisted validation. Do not rely on it.
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  taskId!: string;

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
  notes?: string;
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
  notes?: string;
}
