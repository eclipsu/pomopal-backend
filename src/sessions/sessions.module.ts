import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { Session } from 'src/entities/sessions.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Session])],

  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
