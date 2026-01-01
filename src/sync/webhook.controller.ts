import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly syncService: SyncService) {}

  @Public()
  @Post('google-calendar')
  @HttpCode(HttpStatus.OK)
  async handleGoogleCalendarWebhook(
    @Headers('x-goog-channel-id') channelId: string,
    @Headers('x-goog-resource-id') resourceId: string,
    @Headers('x-goog-resource-state') resourceState: string,
    @Headers('x-goog-channel-expiration') expiration: string,
  ): Promise<void> {
    this.logger.log(
      `Received Google Calendar webhook: channelId=${channelId}, state=${resourceState}`,
    );

    if (resourceState === 'sync') {
      this.logger.log('Initial sync notification received, ignoring');
      return;
    }

    if (resourceState === 'exists' || resourceState === 'update') {
      await this.syncService.handleWebhookNotification(channelId, resourceId);
    }
  }
}
