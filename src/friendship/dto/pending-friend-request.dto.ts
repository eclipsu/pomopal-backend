export class PendingFriendRequestDto {
  id!: string;
  status!: string;
  created_at!: Date;
  requester?: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
  addressee?: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
}
