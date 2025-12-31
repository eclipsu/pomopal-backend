import { IsInt, Min } from 'class-validator';
export class CompleteSessionDto {
  @IsInt()
  @Min(1)
  actual_duration_minutes: number;
}
