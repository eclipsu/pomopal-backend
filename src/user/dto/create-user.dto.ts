import { IsNumber, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  password: string;

  @IsString()
  timezone: string;

  /** First name, all lowercase letters. Required for email signup. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username?: string;

  @IsNumber()
  @IsOptional()
  pomodoro_minutes?: number;

  @IsNumber()
  @IsOptional()
  short_break_minutes?: number;

  @IsNumber()
  @IsOptional()
  long_break_minutes?: number;

  @IsString()
  @IsUrl()
  @IsOptional()
  avatar_url?: string;
}
