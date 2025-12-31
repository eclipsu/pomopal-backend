import { IsString } from 'class-validator';

export class CalendarRangeDto {
  @IsString()
  from: string; // YYYY-MM-DD

  @IsString()
  to: string; // YYYY-MM-DD
}
