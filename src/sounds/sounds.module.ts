import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoundLibrary } from '../entities/sound-library.entity';
import { User } from '../entities/user.entity';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { UserModule } from '../user/user.module';
import { StorageModule } from '../storage/storage.module';
import { PresenceModule } from '../presence/presence.module';
import { AdminSoundsController } from './admin-sounds.controller';
import { SoundsController } from './sounds.controller';
import { SoundsService } from './sounds.service';
import { YoutubeParserService } from './youtube-parser.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoundLibrary, User]),
    UserModule,
    StorageModule,
    PresenceModule,
  ],
  controllers: [SoundsController, AdminSoundsController],
  providers: [SoundsService, YoutubeParserService, AdminGuard],
  exports: [SoundsService],
})
export class SoundsModule {}
