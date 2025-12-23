import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { SyncService, SyncResult } from './sync.service';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { CalendarData } from '../google-calendar/google-calendar.service';
import { UserDocument } from '../users/user.schema';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Sanitize userId - handles cases where userId is passed multiple times
   */
  private sanitizeUserId(userId: string): string {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    // Handle duplicate query params (e.g., ?userId=xxx&userId=xxx becomes "xxx,xxx")
    const cleanId = userId.split(',')[0].trim();
    // Validate MongoDB ObjectId format (24 hex characters)
    if (!/^[a-fA-F0-9]{24}$/.test(cleanId)) {
      throw new BadRequestException('Invalid userId format');
    }
    return cleanId;
  }

  // ============================================
  // USER-LEVEL SYNC ENDPOINTS (New Architecture)
  // ============================================

  /**
   * Initialize the dedicated "Axis" calendar for a user
   * This creates the calendar, enables webhooks, and syncs all tasks
   */
  @Post('initialize')
  async initializeSync(
    @Query('userId') userId: string,
  ): Promise<{ user: UserDocument; message: string }> {
    const cleanUserId = this.sanitizeUserId(userId);
    const user = await this.syncService.initializeDedicatedCalendar(cleanUserId);
    return {
      user,
      message: 'Sync initialized successfully. All tasks will now sync to your Axis calendar.',
    };
  }

  /**
   * Get sync status for a user
   */
  @Get('status')
  async getSyncStatus(
    @Query('userId') userId: string,
  ): Promise<{
    enabled: boolean;
    calendarId: string | null;
    webhookActive: boolean;
  }> {
    const cleanUserId = this.sanitizeUserId(userId);
    const user = await this.syncService.getConnectedUser();
    if (!user || user._id.toString() !== cleanUserId) {
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

  /**
   * Disconnect sync for a user
   * Clears calendar sync settings but keeps the calendar on Google
   */
  @Delete('disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectSync(@Query('userId') userId: string): Promise<void> {
    const cleanUserId = this.sanitizeUserId(userId);
    await this.syncService.disconnectSync(cleanUserId);
  }

  /**
   * List user's Google Calendars
   */
  @Get('google/calendars')
  async getGoogleCalendars(
    @Query('userId') userId: string,
  ): Promise<{ calendars: CalendarData[] }> {
    const cleanUserId = this.sanitizeUserId(userId);
    const calendars = await this.syncService.getGoogleCalendars(cleanUserId);
    return { calendars };
  }

  // ============================================
  // TASK SYNC ENDPOINTS
  // ============================================

  /**
   * Manually sync a single task to Google Calendar
   */
  @Post('task/:taskId')
  async syncTask(
    @Param('taskId') taskId: string,
    @Query('userId') userId: string,
  ): Promise<TaskDocument> {
    const cleanUserId = this.sanitizeUserId(userId);
    return this.syncService.syncTaskToGoogle(cleanUserId, taskId);
  }

  /**
   * Sync all scheduled tasks to Google Calendar
   */
  @Post('tasks/all')
  async syncAllTasks(
    @Query('userId') userId: string,
  ): Promise<SyncResult> {
    const cleanUserId = this.sanitizeUserId(userId);
    return this.syncService.syncAllTasksToGoogle(cleanUserId);
  }

  // ============================================
  // GOOGLE TO APP SYNC ENDPOINTS
  // ============================================

  /**
   * Sync events from Google Calendar to tasks
   */
  @Post('from-google')
  async syncFromGoogle(
    @Query('userId') userId: string,
  ): Promise<SyncResult> {
    const cleanUserId = this.sanitizeUserId(userId);
    return this.syncService.syncGoogleEventsToTasks(cleanUserId);
  }

  // ============================================
  // WEBHOOK MANAGEMENT ENDPOINTS
  // ============================================

  /**
   * Enable webhook for user's dedicated calendar
   */
  @Post('webhook/enable')
  async enableWebhook(
    @Query('userId') userId: string,
  ): Promise<UserDocument> {
    const cleanUserId = this.sanitizeUserId(userId);
    return this.syncService.enableUserWebhook(cleanUserId);
  }

  /**
   * Disable webhook for user's dedicated calendar
   */
  @Delete('webhook/disable')
  @HttpCode(HttpStatus.OK)
  async disableWebhook(
    @Query('userId') userId: string,
  ): Promise<UserDocument> {
    const cleanUserId = this.sanitizeUserId(userId);
    return this.syncService.disableUserWebhook(cleanUserId);
  }

  /**
   * Refresh webhooks that are about to expire
   */
  @Post('webhooks/refresh')
  async refreshWebhooks(): Promise<{ refreshed: number; failed: number }> {
    return this.syncService.refreshExpiredWebhooks();
  }

  /**
   * Enable webhooks for all connected users without active webhooks
   */
  @Post('webhooks/enable-all')
  async enableAllWebhooks(): Promise<{ enabled: number; failed: number }> {
    return this.syncService.enableWebhooksForAllConnectedUsers();
  }

  // ============================================
  // LEGACY ENDPOINTS (Deprecated - kept for backwards compatibility)
  // ============================================

  /** @deprecated Use POST /sync/task/:taskId instead */
  @Post('task/:taskId/to-google')
  async legacySyncTaskToGoogle(
    @Param('taskId') taskId: string,
    @Query('userId') userId: string,
  ): Promise<TaskDocument> {
    const cleanUserId = this.sanitizeUserId(userId);
    return this.syncService.syncTaskToGoogle(cleanUserId, taskId);
  }
}
