import { IsEnum, IsInt, Min } from 'class-validator';
import { SessionType } from '../../entities/sessions.entity';

export class CreateSessionDto {
  @IsEnum(SessionType)
  type: SessionType;

  @IsInt()
  @Min(1)
  planned_minutes: number;
}
