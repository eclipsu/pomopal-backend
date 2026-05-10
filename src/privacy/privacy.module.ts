import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPrivacy } from 'src/entities/user-privacy.entity';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserPrivacy])],
  providers: [PrivacyService],
  controllers: [PrivacyController],
  exports: [PrivacyService],
})
export class PrivacyModule {}
