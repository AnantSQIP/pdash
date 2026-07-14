import {
  IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** An emptied form field submits "" — treat it as "cleared", not as an invalid value. */
const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'];

export class UpdateProfileDto {
  // ── Directory (lives on User) ──
  @IsOptional() @IsString() @MaxLength(20)
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

  @IsOptional() @IsString() @MaxLength(20) @emptyToNull()
  alternatePhone?: string | null;

  // ── Current address ──
  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() currentLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() currentLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() currentCity?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() currentState?: string | null;
  @IsOptional() @IsString() @MaxLength(20)  @emptyToNull() currentPostalCode?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() currentCountry?: string | null;

  // ── Permanent address ──
  @IsOptional() @IsBoolean()
  permanentSameAsCurrent?: boolean;

  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() permanentLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(120) @emptyToNull() permanentLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() permanentCity?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() permanentState?: string | null;
  @IsOptional() @IsString() @MaxLength(20)  @emptyToNull() permanentPostalCode?: string | null;
  @IsOptional() @IsString() @MaxLength(60)  @emptyToNull() permanentCountry?: string | null;

  // ── Emergency contact ──
  @IsOptional() @IsString() @MaxLength(80) @emptyToNull() emergencyName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) @emptyToNull() emergencyRelationship?: string | null;
  @IsOptional() @IsString() @MaxLength(20) @emptyToNull() emergencyPhone?: string | null;
}
