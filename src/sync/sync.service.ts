import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { User, UserDocument } from '../users/user.schema';
import {
  GoogleCalendarService,
  GoogleEvent,
  EventData,
  CalendarData,
} from '../google-calendar/google-calendar.service';
import { AuthService } from '../auth/auth.service';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

const INBOX_PROJECT_NAME = 'Inbox';
const DEFAULT_CALENDAR_NAME = 'Axis';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly defaultEventDuration = 60 * 60 * 1000; // 1 hour in ms

  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private googleCalendarService: GoogleCalendarService,
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  private getWebhookUrl(): string {
    const baseUrl = this.configService.get<string>('WEBHOOK_BASE_URL');
    if (!baseUrl) {
      throw new Error('WEBHOOK_BASE_URL is not configured');
    }
    return `${baseUrl}/webhook/google-calendar`;
  }

  private getCalendarName(): string {
    return (
      this.configService.get<string>('APP_CALENDAR_NAME') ||
      DEFAULT_CALENDAR_NAME
    );
  }

  // ============================================
  // DEDICATED CALENDAR INITIALIZATION
  // ============================================

  /**
   * Initialize the dedicated "Axis" calendar for a user
   * Called after Google OAuth login
   */
  async initializeDedicatedCalendar(userId: string): Promise<UserDocument> {
    await this.validateGoogleAuth(userId);
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const calendarName = this.getCalendarName();

    try {
      // Check if calendar already exists
      let calendarId = user.dedicatedCalendarId;

      if (!calendarId) {
        // Check if a calendar with this name already exists
        const existingCalendar =
          await this.googleCalendarService.findCalendarByName(
            userId,
            calendarName,
          );

        if (existingCalendar?.id) {
          calendarId = existingCalendar.id;
          this.logger.log(
            `Found existing calendar "${calendarName}" for user ${userId}`,
          );
        } else {
          // Create new calendar
          const newCalendar = await this.googleCalendarService.createCalendar(
            userId,
            calendarName,
            'Tasks and events from your Time Management app',
          );
          if (!newCalendar.id) {
            throw new Error('Failed to create dedicated calendar');
          }
          calendarId = newCalendar.id;
          this.logger.log(
            `Created new calendar "${calendarName}" for user ${userId}`,
          );
        }
      }

      // Update user with calendar info
      user.dedicatedCalendarId = calendarId;
      user.autoSyncEnabled = true;
      await user.save();

      // Enable webhook for the dedicated calendar
      await this.enableUserWebhook(userId);

      // Create Inbox project if it doesn't exist
      await this.getOrCreateInboxProject();

      // Sync all existing scheduled tasks to the calendar
      await this.syncAllTasksToGoogle(userId);

      this.logger.log(`Dedicated calendar initialized for user ${userId}`);
      return user;
    } catch (error) {
      this.logger.error(
        `Failed to initialize dedicated calendar for user ${userId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get or create the Inbox project for events from Google without a project
   */
  async getOrCreateInboxProject(): Promise<ProjectDocument> {
    let inboxProject = await this.projectModel.findOne({
      name: INBOX_PROJECT_NAME,
    });

    if (!inboxProject) {
      inboxProject = await this.projectModel.create({
        name: INBOX_PROJECT_NAME,
        description: 'Default project for tasks synced from Google Calendar',
        status: 'active',
        color: '#808080', // Gray color for inbox
      });
      this.logger.log('Created Inbox project');
    }

    return inboxProject;
  }

  // ============================================
  // USER & CONNECTION HELPERS
  // ============================================

  /**
   * Get the connected Google user (user with autoSyncEnabled)
   */
  async getConnectedUser(): Promise<UserDocument | null> {
    return this.userModel.findOne({
      autoSyncEnabled: true,
      dedicatedCalendarId: { $exists: true, $ne: null },
    });
  }

  /**
   * Get user by webhook channel ID
   */
  async getUserByWebhookChannel(
    channelId: string,
  ): Promise<UserDocument | null> {
    return this.userModel.findOne({ webhookChannelId: channelId });
  }

  async getGoogleCalendars(userId: string): Promise<CalendarData[]> {
    await this.validateGoogleAuth(userId);
    return this.googleCalendarService.listCalendars(userId);
  }

  // ============================================
  // TASK TO GOOGLE SYNC (App → Google)
  // ============================================

  /**
   * Sync a single task to Google Calendar
   */
  async syncTaskToGoogle(
    userId: string,
    taskId: string,
  ): Promise<TaskDocument> {
    await this.validateGoogleAuth(userId);

    const user = await this.userModel.findById(userId);
    if (!user?.dedicatedCalendarId) {
      throw new BadRequestException(
        'User does not have a dedicated calendar configured',
      );
    }

    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.scheduledDate) {
      throw new BadRequestException('Task must have a scheduled date to sync');
    }

    // Get project for colorId
    const project = task.project
      ? await this.projectModel.findOne({ name: task.project })
      : null;

    const eventData = this.taskToEventData(task, project);

    try {
      let googleEvent: GoogleEvent;

      if (task.googleEventId) {
        // Check if event still exists
        const existingEvent = await this.googleCalendarService.getEvent(
          userId,
          user.dedicatedCalendarId,
          task.googleEventId,
        );

        if (existingEvent) {
          googleEvent = await this.googleCalendarService.updateEvent(
            userId,
            user.dedicatedCalendarId,
            task.googleEventId,
            eventData,
          );
        } else {
          googleEvent = await this.googleCalendarService.createEvent(
            userId,
            user.dedicatedCalendarId,
            eventData,
          );
        }
      } else {
        googleEvent = await this.googleCalendarService.createEvent(
          userId,
          user.dedicatedCalendarId,
          eventData,
        );
      }

      if (!googleEvent.id) {
        throw new Error('Failed to create/update Google event');
      }

      task.googleEventId = googleEvent.id;
      task.lastSyncedAt = new Date();
      await task.save();

      this.logger.log(`Task ${taskId} synced to Google Calendar`);
      return task;
    } catch (error) {
      this.logger.error(`Failed to sync task ${taskId}`, error);
      throw error;
    }
  }

  /**
   * Auto-sync task to Google (called from TasksService)
   */
  async autoSyncTaskToGoogle(taskId: string): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId);
      if (!task || !task.scheduledDate) {
        return;
      }

      const user = await this.getConnectedUser();
      if (!user) {
        return;
      }

      const hasAuth = await this.authService.hasValidGoogleAuth(
        user._id.toString(),
      );
      if (!hasAuth) {
        this.logger.warn('Auto-sync skipped: No valid Google auth');
        return;
      }

      await this.syncTaskToGoogle(user._id.toString(), taskId);
      this.logger.log(`Auto-synced task ${taskId} to Google Calendar`);
    } catch (error) {
      this.logger.error(`Auto-sync failed for task ${taskId}`, error);
    }
  }

  /**
   * Auto-delete task from Google (called from TasksService)
   */
  async autoDeleteTaskFromGoogle(task: TaskDocument): Promise<void> {
    try {
      if (!task.googleEventId) {
        return;
      }

      const user = await this.getConnectedUser();
      if (!user?.dedicatedCalendarId) {
        return;
      }

      const hasAuth = await this.authService.hasValidGoogleAuth(
        user._id.toString(),
      );
      if (!hasAuth) {
        return;
      }

      await this.googleCalendarService.deleteEvent(
        user._id.toString(),
        user.dedicatedCalendarId,
        task.googleEventId,
      );
      this.logger.log(
        `Auto-deleted event ${task.googleEventId} from Google Calendar`,
      );
    } catch (error) {
      this.logger.warn(`Auto-delete event failed: ${error.message}`);
    }
  }

  /**
   * Sync all scheduled tasks to Google Calendar
   */
  async syncAllTasksToGoogle(userId: string): Promise<SyncResult> {
    await this.validateGoogleAuth(userId);

    const tasks = await this.taskModel.find({
      scheduledDate: { $exists: true, $ne: null },
    });

    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    for (const task of tasks) {
      try {
        await this.syncTaskToGoogle(userId, task._id.toString());
        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Task "${task.title}": ${error.message}`);
      }
    }

    result.success = result.failed === 0;
    this.logger.log(`Synced ${result.synced} tasks, ${result.failed} failed`);
    return result;
  }

  // ============================================
  // GOOGLE TO TASK SYNC (Google → App)
  // ============================================

  /**
   * Sync events from Google Calendar to tasks
   */
  async syncGoogleEventsToTasks(userId: string): Promise<SyncResult> {
    await this.validateGoogleAuth(userId);

    const user = await this.userModel.findById(userId);
    if (!user?.dedicatedCalendarId) {
      throw new BadRequestException('User does not have a dedicated calendar');
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAhead = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

    const events = await this.googleCalendarService.listEvents(
      userId,
      user.dedicatedCalendarId,
      threeMonthsAgo,
      sixMonthsAhead,
    );

    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    for (const event of events) {
      try {
        await this.syncEventToTask(event);
        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Event "${event.summary}": ${error.message}`);
      }
    }

    // Handle deleted events
    const deletedCount = await this.handleDeletedGoogleEvents(
      user.dedicatedCalendarId,
      events,
    );
    result.synced += deletedCount;

    result.success = result.failed === 0;
    this.logger.log(
      `Synced ${result.synced} events from Google, ${result.failed} failed`,
    );
    return result;
  }

  /**
   * Sync a single Google event to a task
   */
  private async syncEventToTask(event: GoogleEvent): Promise<TaskDocument> {
    const taskId = event.extendedProperties?.private?.axis_task_id;
    const projectId = event.extendedProperties?.private?.axis_project_id;

    let task: TaskDocument | null = null;

    // First try to find by task ID from extended properties
    if (taskId) {
      task = await this.taskModel.findById(taskId);
    }

    // Then try by googleEventId
    if (!task && event.id) {
      task = await this.taskModel.findOne({ googleEventId: event.id });
    }

    const { scheduledDate, scheduledEndDate } = this.parseEventDateTime(event);

    if (task) {
      // Update existing task
      task.title = event.summary || task.title;
      task.description = event.description ?? task.description;
      task.scheduledDate = scheduledDate;
      if (scheduledEndDate !== undefined) {
        task.scheduledEndDate = scheduledEndDate;
      }
      // Note: deadline is NOT updated from Google - it's a user-set due date, independent of calendar event duration
      task.googleEventId = event.id ?? task.googleEventId;
      task.lastSyncedAt = new Date();
      await task.save();
      return task;
    }

    // Create new task
    let projectName = INBOX_PROJECT_NAME;

    if (projectId) {
      const project = await this.projectModel.findById(projectId);
      if (project) {
        projectName = project.name;
      }
    }

    // Ensure Inbox project exists
    await this.getOrCreateInboxProject();

    const newTask = await this.taskModel.create({
      title: event.summary || 'Untitled Event',
      description: event.description ?? undefined,
      project: projectName,
      scheduledDate,
      scheduledEndDate,
      googleEventId: event.id ?? undefined,
      lastSyncedAt: new Date(),
      status: 'todo',
      completed: false,
    });

    this.logger.log(`Created task "${newTask.title}" from Google event`);
    this.logger.log(`Created task "${newTask}" from Google event`);
    return newTask;
  }

  /**
   * Handle events that were deleted from Google Calendar
   */
  private async handleDeletedGoogleEvents(
    calendarId: string,
    currentEvents: GoogleEvent[],
  ): Promise<number> {
    const currentEventIds = new Set(currentEvents.map((e) => e.id));

    const tasksWithGoogleIds = await this.taskModel.find({
      googleEventId: { $exists: true, $ne: null },
    });

    let deletedCount = 0;
    for (const task of tasksWithGoogleIds) {
      if (!currentEventIds.has(task.googleEventId)) {
        task.status = 'done';
        task.completed = true;
        task.googleEventId = undefined;
        task.lastSyncedAt = new Date();
        await task.save();
        deletedCount++;
        this.logger.log(
          `Marked task "${task.title}" as done (event deleted from Google)`,
        );
      }
    }

    return deletedCount;
  }

  // ============================================
  // WEBHOOK MANAGEMENT
  // ============================================

  /**
   * Enable webhook for user's dedicated calendar
   */
  async enableUserWebhook(userId: string): Promise<UserDocument> {
    await this.validateGoogleAuth(userId);

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.dedicatedCalendarId) {
      throw new BadRequestException('User does not have a dedicated calendar');
    }

    try {
      // Stop existing webhook if any
      if (user.webhookChannelId && user.webhookResourceId) {
        await this.googleCalendarService.stopWatch(
          userId,
          user.webhookChannelId,
          user.webhookResourceId,
        );
      }

      const webhookUrl = this.getWebhookUrl();
      const watchData = await this.googleCalendarService.watchCalendar(
        userId,
        user.dedicatedCalendarId,
        webhookUrl,
      );

      user.webhookChannelId = watchData.channelId;
      user.webhookResourceId = watchData.resourceId;
      user.webhookExpiration = watchData.expiration;
      await user.save();

      this.logger.log(`Webhook enabled for user ${userId}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to enable webhook for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Disable webhook for user's dedicated calendar
   */
  async disableUserWebhook(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      if (user.webhookChannelId && user.webhookResourceId) {
        await this.googleCalendarService.stopWatch(
          userId,
          user.webhookChannelId,
          user.webhookResourceId,
        );
      }

      user.webhookChannelId = undefined;
      user.webhookResourceId = undefined;
      user.webhookExpiration = undefined;
      await user.save();

      this.logger.log(`Webhook disabled for user ${userId}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to disable webhook for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Handle incoming webhook notification from Google
   */
  async handleWebhookNotification(
    channelId: string,
    resourceId: string,
  ): Promise<void> {
    this.logger.log(`Processing webhook notification: channelId=${channelId}`);

    const user = await this.getUserByWebhookChannel(channelId);
    if (!user) {
      this.logger.warn(`No user found for webhook channelId: ${channelId}`);
      return;
    }

    try {
      const hasAuth = await this.authService.hasValidGoogleAuth(
        user._id.toString(),
      );
      if (!hasAuth) {
        this.logger.warn(`User ${user._id} has no valid Google auth`);
        return;
      }

      await this.syncGoogleEventsToTasks(user._id.toString());
      this.logger.log(`Webhook sync completed for user ${user._id}`);
    } catch (error) {
      this.logger.error(`Webhook sync failed for user ${user._id}`, error);
    }
  }

  /**
   * Refresh webhooks that are about to expire
   */
  async refreshExpiredWebhooks(): Promise<{
    refreshed: number;
    failed: number;
  }> {
    const now = new Date();
    const buffer = 24 * 60 * 60 * 1000; // 1 day buffer

    const usersNeedingRefresh = await this.userModel.find({
      autoSyncEnabled: true,
      webhookChannelId: { $exists: true },
      webhookExpiration: { $lt: new Date(now.getTime() + buffer) },
    });

    let refreshed = 0;
    let failed = 0;

    for (const user of usersNeedingRefresh) {
      try {
        await this.enableUserWebhook(user._id.toString());
        refreshed++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to refresh webhook for user ${user._id}`,
          error,
        );
      }
    }

    this.logger.log(`Refreshed ${refreshed} webhooks, ${failed} failed`);
    return { refreshed, failed };
  }

  /**
   * Enable webhooks for all users with auto-sync but no webhook
   */
  async enableWebhooksForAllConnectedUsers(): Promise<{
    enabled: number;
    failed: number;
  }> {
    const users = await this.userModel.find({
      autoSyncEnabled: true,
      dedicatedCalendarId: { $exists: true, $ne: null },
      webhookChannelId: { $exists: false },
    });

    let enabled = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.enableUserWebhook(user._id.toString());
        enabled++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to enable webhook for user ${user._id}`,
          error,
        );
      }
    }

    this.logger.log(`Enabled ${enabled} webhooks, ${failed} failed`);
    return { enabled, failed };
  }

  // ============================================
  // DISCONNECT / CLEANUP
  // ============================================

  /**
   * Disconnect user from Google Calendar sync
   */
  async disconnectSync(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      // Stop webhook
      if (user.webhookChannelId && user.webhookResourceId) {
        await this.googleCalendarService.stopWatch(
          userId,
          user.webhookChannelId,
          user.webhookResourceId,
        );
      }

      // Clear all sync-related fields
      user.dedicatedCalendarId = undefined;
      user.autoSyncEnabled = false;
      user.webhookChannelId = undefined;
      user.webhookResourceId = undefined;
      user.webhookExpiration = undefined;
      await user.save();

      // Clear googleEventId from all tasks
      await this.taskModel.updateMany(
        { googleEventId: { $exists: true } },
        { $unset: { googleEventId: 1, lastSyncedAt: 1 } },
      );

      this.logger.log(`Sync disconnected for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect sync for user ${userId}`, error);
      throw error;
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async validateGoogleAuth(userId: string): Promise<void> {
    const hasAuth = await this.authService.hasValidGoogleAuth(userId);
    if (!hasAuth) {
      throw new BadRequestException(
        'Google Calendar not connected. Please connect your Google account first.',
      );
    }
  }

  private taskToEventData(
    task: TaskDocument,
    project: ProjectDocument | null,
  ): EventData {
    const startDateTime = new Date(task.scheduledDate);

    // Use scheduledEndDate if provided, otherwise default to 1 hour after start
    const endDateTime = task.scheduledEndDate
      ? new Date(task.scheduledEndDate)
      : new Date(startDateTime.getTime() + this.defaultEventDuration);

    return {
      title: task.title,
      description: task.description,
      startDateTime,
      endDateTime,
      colorId: project?.colorId,
      extendedProperties: {
        axis_project_id: project?._id?.toString(),
        axis_task_id: task._id?.toString(),
      },
    };
  }

  private parseEventDateTime(event: GoogleEvent): {
    scheduledDate: Date;
    scheduledEndDate?: Date;
  } {
    let scheduledDate: Date;
    let scheduledEndDate: Date | undefined;

    if (event.start?.dateTime) {
      scheduledDate = new Date(event.start.dateTime);
    } else if (event.start?.date) {
      scheduledDate = new Date(event.start.date);
    } else {
      scheduledDate = new Date();
    }

    // Extract end date/time as scheduledEndDate
    // Note: deadline is NOT populated from Google - it's a user-set due date, independent of calendar event duration
    if (event.end?.dateTime) {
      scheduledEndDate = new Date(event.end.dateTime);
    } else if (event.end?.date) {
      scheduledEndDate = new Date(event.end.date);
    }

    return { scheduledDate, scheduledEndDate };
  }

  // ============================================
  // LEGACY METHODS (kept for backwards compatibility)
  // ============================================

  /** @deprecated Use syncTaskToGoogle instead */
  async syncTaskToEvent(userId: string, taskId: string): Promise<TaskDocument> {
    return this.syncTaskToGoogle(userId, taskId);
  }

  /** @deprecated Use getConnectedUser instead */
  async getAllSyncedProjects(): Promise<ProjectDocument[]> {
    return this.projectModel.find({
      syncWithGoogle: true,
      syncUserId: { $exists: true, $ne: null },
    });
  }
}
