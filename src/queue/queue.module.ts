import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { bullmqConnection } from './bullmq-connection';
import {
  QUEUE_EMAIL,
  QUEUE_EVENTS,
  QUEUE_PREFIX,
  QUEUE_SCHEDULE,
} from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: bullmqConnection(config),
        prefix: config.get<string>('BULLMQ_PREFIX') || QUEUE_PREFIX,
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_SCHEDULE },
      { name: QUEUE_EVENTS },
      { name: QUEUE_EMAIL },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
