import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePermissionDto {
  @IsString() @MinLength(3) @MaxLength(80)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class UpdatePermissionDto {
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class CreateRoleDto {
  @IsString()
  organizationId!: string;

  @IsString() @MinLength(1) @MaxLength(60)
  name!: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MaxLength(60)
  name?: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class SetPermissionsDto {
  @IsArray() @IsString({ each: true })
  permissionIds!: string[];
}

export class CreateGroupDto {
  @IsString()
  organizationId!: string;

  @IsString() @MinLength(1) @MaxLength(60)
  name!: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MaxLength(60)
  name?: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class SetMembersDto {
  @IsArray() @IsString({ each: true })
  userIds!: string[];
}

class OverrideItem {
  @IsString()
  permissionId!: string;

  @IsIn(['ALLOW', 'DENY'])
  effect!: string;
}

export class SetOverridesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => OverrideItem)
  overrides!: OverrideItem[];
}
