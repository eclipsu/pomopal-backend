import { IsString } from 'class-validator';

export class AcceptFriendInviteDto {
  @IsString()
  token!: string;
}
