import { PartialType } from '@nestjs/mapped-types';
import { CreateStreakDto } from './create-streak.dto';

export class UpdateStreakDto extends PartialType(CreateStreakDto) {}
