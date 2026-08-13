import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, MinLength,
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
