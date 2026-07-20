import { IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

// A technical issue / glitch someone hit while working. Raising it logs the time it
// cost as a non-billable timesheet entry (see IssuesService).
export class CreateIssueDto {
  @IsString()
  projectId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Time the issue cost (hours) — logged as non-billable.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  hours?: number;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class UpdateIssueDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
