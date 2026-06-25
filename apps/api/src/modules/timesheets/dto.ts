import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateTimesheetDto {
  @IsString()
  userId!: string;

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
