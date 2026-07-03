import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
