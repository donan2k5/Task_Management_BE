import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncService } from './sync.service';

@Injectable()
export class SyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SyncSchedulerService.name);

  constructor(private readonly syncService: SyncService) {}

  async onModuleInit() {
    this.logger.log('Sync scheduler initialized');
    // Delay startup tasks to allow application to fully initialize
    setTimeout(() => this.setupOnStartup(), 10000);
  }

  private async setupOnStartup(): Promise<void> {
    try {
      this.logger.log('Enabling webhooks for connected users on startup...');
      const result = await this.syncService.enableWebhooksForAllConnectedUsers();
      this.logger.log(
        `Startup webhook setup: enabled=${result.enabled}, failed=${result.failed}`,
      );
    } catch (error) {
      this.logger.error('Failed to enable webhooks on startup', error);
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshWebhooks(): Promise<void> {
    this.logger.log('Running scheduled webhook refresh...');
    try {
      const result = await this.syncService.refreshExpiredWebhooks();
      this.logger.log(
        `Webhook refresh completed: refreshed=${result.refreshed}, failed=${result.failed}`,
      );
    } catch (error) {
      this.logger.error('Scheduled webhook refresh failed', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async periodicSync(): Promise<void> {
    this.logger.log('Running hourly periodic sync...');
    try {
      await this.syncAllConnectedUsers();
      this.logger.log('Hourly periodic sync completed');
    } catch (error) {
      this.logger.error('Hourly periodic sync failed', error);
    }
  }

  private async syncAllConnectedUsers(): Promise<void> {
    const user = await this.syncService.getConnectedUser();

    if (!user) {
      this.logger.debug('No connected users found for periodic sync');
      return;
    }

    try {
      await this.syncService.syncGoogleEventsToTasks(user._id.toString());
      this.logger.debug(`Synced events for user: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to sync for user ${user.email}`, error);
    }
  }
}
