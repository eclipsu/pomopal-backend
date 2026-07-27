import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FontLibrary } from '../entities/font-library.entity';
import { User } from '../entities/user.entity';
import { AdminGuard } from '../auth/guards/admin/admin.guard';
import { UserModule } from '../user/user.module';
import { StorageModule } from '../storage/storage.module';
import { AdminFontsController } from './admin-fonts.controller';
import { FontsController } from './fonts.controller';
import { FontsService } from './fonts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FontLibrary, User]),
    UserModule,
    StorageModule,
  ],
  controllers: [FontsController, AdminFontsController],
  providers: [FontsService, AdminGuard],
  exports: [FontsService],
})
export class FontsModule {}
