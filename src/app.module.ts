import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionsModule } from './sessions/sessions.module';
import dbConfig from './config/dbConfig';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import jwtConfig from './auth/config/jwt.config';

@Module({
  imports: [
    SessionsModule,
    TypeOrmModule.forRootAsync({
      useFactory: dbConfig,
    }),
    ConfigModule.forRoot({ isGlobal: true, load: [dbConfig, jwtConfig] }),
    UserModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
