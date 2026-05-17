import { IsEmail } from 'class-validator';

export class SendFriendInviteDto {
  @IsEmail()
  email!: string;
}
