export class SessionResponseDto {
  id: string;
  userId: string;
  type: string;
  planned_duration_minutes: number;
  actual_duration_minutes?: number;
  started_at: Date;
  ended_at?: Date;
  completed: boolean;
}
