import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString,
  IsUrl, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateClientDto {
  // The code baked into every handle Pat_<code>_<serial>. MANDATORY. Alphanumeric only so the
  // handle parses cleanly; uppercased for consistency.
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9]+$/, { message: 'Client code must be letters/numbers only (e.g. MLK).' })
  @MinLength(2)
  @MaxLength(5)
  code!: string; // "MLK"

  // Client name — OPTIONAL. When omitted, the portal shows the code alone.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(100)
  name?: string; // "Malikie"

  // ── The relationship ────────────────────────────────────────────────────────────────────────
  // All optional, and all nullable on the way in: sending null CLEARS a field, which is the only
  // way to unset one. An omitted key leaves the stored value alone.
  @IsOptional() @IsString() @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  contactName?: string | null;

  // A bad address here is worse than an empty one — it looks like a way to reach the client and
  // is not — so it is validated rather than merely trimmed.
  @IsOptional() @IsEmail({}, { message: 'Contact email does not look like an email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  contactEmail?: string | null;

  @IsOptional() @IsString() @MaxLength(40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  contactPhone?: string | null;

  @IsOptional() @IsUrl({ require_protocol: false }, { message: 'Website does not look like a URL.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  website?: string | null;

  @IsOptional() @IsString() @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  country?: string | null;

  @IsOptional() @IsString() @MaxLength(400)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  address?: string | null;

  @IsOptional() @IsString() @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  industry?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  notes?: string | null;

  // The rate is what turns hours into money. Capped high rather than left open: a mistyped rate
  // silently multiplies every figure on the ledger, and 100,000 an hour is not a rate.
  @IsOptional() @IsNumber() @Min(0) @Max(100000)
  billingRate?: number | null;

  @IsOptional() @IsIn(['INR', 'USD', 'EUR', 'GBP'])
  billingCurrency?: string;

  @IsOptional() @IsDateString()
  engagementStart?: string | null;

  @IsOptional() @IsString()
  accountManagerId?: string | null;
}

export class UpdateClientDto {
  // New code (optional). Changing it re-mints the client's patent handles. Alphanumeric.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9]+$/, { message: 'Client code must be letters/numbers only (e.g. MLK).' })
  @MinLength(2)
  @MaxLength(5)
  code?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(100)
  name?: string;

  // ── The relationship ────────────────────────────────────────────────────────────────────────
  // All optional, and all nullable on the way in: sending null CLEARS a field, which is the only
  // way to unset one. An omitted key leaves the stored value alone.
  @IsOptional() @IsString() @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  contactName?: string | null;

  // A bad address here is worse than an empty one — it looks like a way to reach the client and
  // is not — so it is validated rather than merely trimmed.
  @IsOptional() @IsEmail({}, { message: 'Contact email does not look like an email address.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  contactEmail?: string | null;

  @IsOptional() @IsString() @MaxLength(40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  contactPhone?: string | null;

  @IsOptional() @IsUrl({ require_protocol: false }, { message: 'Website does not look like a URL.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  website?: string | null;

  @IsOptional() @IsString() @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  country?: string | null;

  @IsOptional() @IsString() @MaxLength(400)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  address?: string | null;

  @IsOptional() @IsString() @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  industry?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  notes?: string | null;

  // The rate is what turns hours into money. Capped high rather than left open: a mistyped rate
  // silently multiplies every figure on the ledger, and 100,000 an hour is not a rate.
  @IsOptional() @IsNumber() @Min(0) @Max(100000)
  billingRate?: number | null;

  @IsOptional() @IsIn(['INR', 'USD', 'EUR', 'GBP'])
  billingCurrency?: string;

  @IsOptional() @IsDateString()
  engagementStart?: string | null;

  @IsOptional() @IsString()
  accountManagerId?: string | null;
}

export class RegisterPatentsDto {
  @IsString()
  clientId!: string;

  // One or more real patent numbers to register under the client. Each mints the next
  // Pat_<code>_<serial> handle. Blank entries are dropped server-side.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  realNumbers!: string[];
}

/**
 * The Super-Admin-stated figures on a client's ledger.
 *
 * Every field is optional-but-nullable, and the two meanings are different on purpose: OMITTING
 * a field leaves the stored value alone, while sending an explicit `null` clears it and hands
 * the figure back to the derived calculation. Without that distinction there would be no way to
 * undo an override except by guessing the derived number and typing it in.
 */
export class UpdateLedgerOverrideDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(1_000_000, { message: 'That is more hours than anyone has worked — check the figure.' })
  billableHours?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(1e12)
  amount?: number | null;

  // Deliberately a short list. A free-text currency field turns into "INR", "inr", "Rs" and
  // "₹" within a month, and then nothing can be summed.
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['INR', 'USD', 'EUR', 'GBP'])
  currency?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(500)
  note?: string | null;
}

export class UpdatePatentDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  realNumber!: string;
}
