import type { SessionContextSnapshot } from '../../entities/sessions.entity';

export class SessionResponseDto {
  id: string;
  userId: string;
  type: string;
  session_name?: string | null;
  session_name_hash?: string | null;
  planned_duration_minutes: number;
  actual_duration_minutes?: number;
  started_at: Date;
  ended_at?: Date;
  completed: boolean;
  session_context?: SessionContextSnapshot | null;
}
