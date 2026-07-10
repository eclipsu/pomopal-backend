import { IsString, MaxLength, MinLength } from 'class-validator';

export class ParseYoutubeDto {
  @IsString()
  @MinLength(11)
  @MaxLength(512)
  url!: string;
}
