import { IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  password: string;

  @IsString()
  timezone: string;

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
  avatar_url?: string;
}
