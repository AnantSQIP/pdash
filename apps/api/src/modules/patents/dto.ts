import { ArrayNotEmpty, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateClientDto {
  // The code baked into every handle Pat_<code>_<serial>. MANDATORY. Alphanumeric only so the
  // handle parses cleanly; uppercased for consistency.
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9]+$/, { message: 'Client code must be letters/numbers only (e.g. MLK).' })
  @MinLength(1)
  @MaxLength(20)
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
  @MinLength(1)
  @MaxLength(20)
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
  @IsString({ each: true })
  realNumbers!: string[];
}

export class UpdatePatentDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  realNumber!: string;
}
