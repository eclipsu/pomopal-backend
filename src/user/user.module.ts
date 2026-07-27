import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { AuthModule } from 'src/auth/auth.module';
import { StorageModule } from 'src/storage/storage.module';
import { PresenceModule } from 'src/presence/presence.module';
import { UserExistenceBloomService } from './user-existence-bloom.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule),
    StorageModule,
    PresenceModule,
  ],
  controllers: [UserController],
  providers: [UserService, UserExistenceBloomService],
  exports: [UserService, UserExistenceBloomService],
})
export class UserModule {}
