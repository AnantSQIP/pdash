import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @IsString()
  createdBy!: string;
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
  @IsString()
  userId!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
