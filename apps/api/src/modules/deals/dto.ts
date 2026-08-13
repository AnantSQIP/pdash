import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { DEAL_ACTIVITY_TYPES, DEAL_STAGE_VALUES } from '../../common/deal-stages';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export class CreateDealDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(120)
  company!: string;

  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsIn(DEAL_STAGE_VALUES)
  stage?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  value?: number;

  @IsOptional() @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @IsIn(CURRENCIES)
  currency?: string;

  /** Whose deal it is. Defaults to the creator. */
  @IsOptional() @IsString()
  ownerId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  source?: string;

  @IsOptional() @IsString()
  expectedCloseDate?: string;

  @IsOptional() @IsString()
  teamId?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class UpdateDealDto {
  @IsOptional() @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @MinLength(2) @MaxLength(120)
  company?: string;

  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  value?: number | null;

  @IsOptional() @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @IsIn(CURRENCIES)
  currency?: string;

  @IsOptional() @IsString()
  ownerId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  source?: string;

  @IsOptional() @IsString()
  expectedCloseDate?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

/**
 * Moving a deal along the pipeline. `lostReason` is REQUIRED when moving to LOST — a pipeline
 * that does not record why it lost teaches nobody anything, and it is the field people skip
 * unless the form insists.
 */
export class MoveDealDto {
  @IsIn(DEAL_STAGE_VALUES)
  stage!: string;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lostReason?: string;

  /** On WON: link the client this became, so its work reaches the client ledger. */
  @IsOptional() @IsString()
  clientId?: string;

  /** On WON: mint a brand-new client with this code instead of linking an existing one. */
  @IsOptional() @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  newClientCode?: string;
}

export class LogActivityDto {
  @IsIn(DEAL_ACTIVITY_TYPES.filter(t => t !== 'STAGE_CHANGE'))
  type!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsOptional() @IsString()
  occurredAt?: string;
}
