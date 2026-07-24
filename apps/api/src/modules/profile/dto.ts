import {
  IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** An emptied form field submits "" — treat it as "cleared", not as an invalid value. */
const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

/** Normalise a phone to a bare 10-digit number: digits only, dropping a +91 country code
 *  or a leading 0, so "+91 98765-43210" and "098765 43210" both become "9876543210". */
const normalizePhone = () =>
  Transform(({ value }) => {
    if (value == null || value === '') return null;
    let d = String(value).replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d;
  });

/** Postal code → digits only (strip spaces). */
const normalizePin = () =>
  Transform(({ value }) => (value == null || value === '' ? null : String(value).replace(/\s/g, '')));

const PHONE_RE = /^[6-9]\d{9}$/;
const PIN_RE = /^\d{6}$/;
const PHONE_MSG = 'Enter a valid 10-digit Indian mobile number.';
const PIN_MSG = 'Enter a valid 6-digit PIN code.';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'];

export class UpdateProfileDto {
  // ── Directory (lives on User) ──
  @IsOptional() @normalizePhone() @Matches(PHONE_RE, { message: PHONE_MSG })
  phone?: string | null;

  // ── Personal ──
  @IsOptional() @IsDateString() @emptyToNull()
  dateOfBirth?: string | null;

  @IsOptional() @IsIn(GENDERS) @emptyToNull()
  gender?: string | null;

  @IsOptional() @IsIn(BLOOD_GROUPS) @emptyToNull()
  bloodGroup?: string | null;

  @IsOptional() @IsIn(MARITAL) @emptyToNull()
  maritalStatus?: string | null;

  @IsOptional() @IsString() @MaxLength(60) @emptyToNull()
  nationality?: string | null;

  @IsOptional() @IsEmail() @emptyToNull()
  personalEmail?: string | null;

  @IsOptional() @normalizePhone() @Matches(PHONE_RE, { message: PHONE_MSG })
  alternatePhone?: string | null;

  // ── Current address ──
  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() currentLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() currentLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() currentCity?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() currentState?: string | null;
  @IsOptional() @normalizePin() @Matches(PIN_RE, { message: PIN_MSG }) currentPostalCode?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() currentCountry?: string | null;

  // ── Permanent address ──
  @IsOptional() @IsBoolean()
  permanentSameAsCurrent?: boolean;

  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() permanentLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() permanentLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() permanentCity?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() permanentState?: string | null;
  @IsOptional() @normalizePin() @Matches(PIN_RE, { message: PIN_MSG }) permanentPostalCode?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() permanentCountry?: string | null;

  // ── Emergency contact ──
  @IsOptional() @IsString() @MaxLength(80) @emptyToNull() emergencyName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) @emptyToNull() emergencyRelationship?: string | null;
  @IsOptional() @normalizePhone() @Matches(PHONE_RE, { message: PHONE_MSG }) emergencyPhone?: string | null;
}
