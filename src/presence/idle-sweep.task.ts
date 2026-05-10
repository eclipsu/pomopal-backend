import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PresenceService } from './presence.service';
import { PresenceGateway } from './presence.gateway';

@Injectable()
export class IdleSweepTask {
  private readonly logger = new Logger(IdleSweepTask.name);

  constructor(
    private readonly presenceService: PresenceService,
    private readonly presenceGateway: PresenceGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepIdle(): Promise<void> {
    const onlineIds = await this.presenceService.getOnlineUserIds();
    if (!onlineIds.length) return;

    const nowIdled = await this.presenceService.sweepIdleUsers(onlineIds);

    if (nowIdled.length) {
      this.logger.log(`Marked ${nowIdled.length} user(s) as idle.`);

      for (const userId of nowIdled) {
        this.presenceGateway.broadcastActivityUpdate(userId, null);
      }
    }
  }
}
