import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SyncService, SyncResult } from './sync.service';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { CalendarData } from '../google-calendar/google-calendar.service';
import { UserDocument } from '../users/user.schema';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('initialize')
  async initializeSync(
    @CurrentUser('_id') userId: string,
  ): Promise<{ user: UserDocument; message: string }> {
    const updatedUser =
      await this.syncService.initializeDedicatedCalendar(userId);
    return {
      user: updatedUser,
      message:
        'Sync initialized successfully. All tasks will now sync to your Axis calendar.',
    };
  }

  @Get('status')
  async getSyncStatus(@CurrentUser('_id') userId: string): Promise<{
    enabled: boolean;
    calendarId: string | null;
    webhookActive: boolean;
  }> {
    const user = await this.syncService.getUserById(userId);
    if (!user) {
      return {
        enabled: false,
        calendarId: null,
        webhookActive: false,
      };
    }
    return {
      enabled: user.autoSyncEnabled,
      calendarId: user.dedicatedCalendarId || null,
      webhookActive: !!user.webhookChannelId,
    };
  }

  @Delete('disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectSync(@CurrentUser('_id') userId: string): Promise<void> {
    await this.syncService.disconnectSync(userId);
  }

  @Get('google/calendars')
  async getGoogleCalendars(
    @CurrentUser('_id') userId: string,
  ): Promise<{ calendars: CalendarData[] }> {
    const calendars = await this.syncService.getGoogleCalendars(userId);
    return { calendars };
  }

  // ============================================
  // TASK SYNC ENDPOINTS
  // ============================================

  @Post('task/:taskId')
  async syncTask(
    @CurrentUser('_id') userId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskDocument> {
    return this.syncService.syncTaskToGoogle(userId, taskId);
  }

  @Post('tasks/all')
  async syncAllTasks(@CurrentUser('_id') userId: string): Promise<SyncResult> {
    return this.syncService.syncAllTasksToGoogle(userId);
  }

  // ============================================
  // GOOGLE TO APP SYNC ENDPOINTS
  // ============================================

  @Post('from-google')
  async syncFromGoogle(@CurrentUser('_id') userId: string): Promise<SyncResult> {
    return this.syncService.syncGoogleEventsToTasks(userId);
  }

  // ============================================
  // WEBHOOK MANAGEMENT ENDPOINTS
  // ============================================

  @Post('webhook/enable')
  async enableWebhook(
    @CurrentUser('_id') userId: string,
  ): Promise<UserDocument> {
    return this.syncService.enableUserWebhook(userId);
  }

  @Delete('webhook/disable')
  @HttpCode(HttpStatus.OK)
  async disableWebhook(
    @CurrentUser('_id') userId: string,
  ): Promise<UserDocument> {
    return this.syncService.disableUserWebhook(userId);
  }

  @Post('webhooks/refresh')
  async refreshWebhooks(): Promise<{ refreshed: number; failed: number }> {
    return this.syncService.refreshExpiredWebhooks();
  }

  @Post('webhooks/enable-all')
  async enableAllWebhooks(): Promise<{ enabled: number; failed: number }> {
    return this.syncService.enableWebhooksForAllConnectedUsers();
  }
}
