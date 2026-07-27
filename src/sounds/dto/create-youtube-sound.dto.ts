import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { SoundType } from '../../entities/sound-library.entity';

export class CreateYoutubeSoundDto {
  @IsString()
  @MinLength(11)
  @MaxLength(512)
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(['background', 'ring'])
  type?: SoundType;
}
