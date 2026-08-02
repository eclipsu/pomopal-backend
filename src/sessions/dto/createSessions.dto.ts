import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { SessionContextSnapshot } from '../../entities/sessions.entity';
import { SessionType } from '../../entities/sessions.entity';

export class CreateSessionDto {
  @IsEnum(SessionType)
  type: SessionType;

  @IsInt()
  @Min(1)
  planned_minutes: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  session_name?: string;

  @IsOptional()
  @IsObject()
  session_context?: SessionContextSnapshot;
}
