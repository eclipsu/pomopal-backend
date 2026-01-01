/* eslint-disable no-useless-escape */
import { IsNotEmpty, IsString } from 'class-validator';
import { IsTimezone } from '../validator/supported-timezone-validator';

export class TimezoneDto {
  @IsString()
  @IsNotEmpty()
  @IsTimezone({
    message: 'timezone must be a valid IANA timezone (e.g. Asia/Kathmandu)',
  })
  time_zone: string;
}
