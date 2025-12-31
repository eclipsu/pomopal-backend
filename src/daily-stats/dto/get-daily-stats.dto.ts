import { IsDateString } from 'class-validator';

export class GetDailyStatDto {
  @IsDateString()
  date: string; // YYYY-MM-DD
}
