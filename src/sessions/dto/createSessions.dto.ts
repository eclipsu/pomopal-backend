import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import type { SessionContextSnapshot } from '../../entities/sessions.entity';
import { SessionType } from '../../entities/sessions.entity';

export class CreateSessionDto {
  @IsEnum(SessionType)
  type: SessionType;

  @IsInt()
  @Min(1)
  planned_minutes: number;

  @IsOptional()
  @IsObject()
  session_context?: SessionContextSnapshot;
}
