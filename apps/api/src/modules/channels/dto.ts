import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  type?: string;

  // People to invite at creation time. The creator is always added as owner.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];

  // Deprecated/ignored — taken from the verified cookie actor.
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class SetChannelMembersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class CreateMessageDto {
  // Deprecated/ignored — the author is the verified cookie actor.
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
