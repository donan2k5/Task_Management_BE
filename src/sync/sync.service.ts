import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import mongoose, { Model, Types } from 'mongoose';
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
import { TaskMapping, TaskMappingDocument } from './schemas/task-mapping.schema';
import { ConnectedCalendar, ConnectedCalendarDocument } from '../calendars/schemas/connected-calendar.schema';
import { CalendarEvent, CalendarEventDocument } from '../calendars/schemas/calendar-event.schema';

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
    @InjectModel(TaskMapping.name) private taskMappingModel: Model<TaskMappingDocument>,
    @InjectModel(ConnectedCalendar.name) private connectedCalendarModel: Model<ConnectedCalendarDocument>,
    @InjectModel(CalendarEvent.name) private calendarEventModel: Model<CalendarEventDocument>,
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

    // Use findOneAndUpdate to prevent race condition
    // Only proceed if dedicatedCalendarId is not yet set
    let user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Early return if already fully initialized
    if (user.dedicatedCalendarId && user.autoSyncEnabled) {
      this.logger.log(
        `Calendar already initialized for user ${userId}, skipping`,
      );
      return user;
    }

    const calendarName = this.getCalendarName();

    try {
      let calendarId = user.dedicatedCalendarId;

      // ALWAYS check Google for existing calendar with this name first
      // This prevents duplicates even if dedicatedCalendarId is not set
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
      } else if (!calendarId) {
        // Only create if no existing calendar found AND no ID stored
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

      // Use findOneAndUpdate to atomically update only if not already set
      // This prevents race condition where two concurrent calls both try to set
      user = await this.userModel.findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { dedicatedCalendarId: { $exists: false } },
            { dedicatedCalendarId: null },
            { dedicatedCalendarId: calendarId }, // Allow update if same ID
          ],
        },
        {
          $set: {
            dedicatedCalendarId: calendarId,
            autoSyncEnabled: true,
          },
        },
        { new: true },
      );

      // If update failed (another process already set a different calendar), fetch fresh
      if (!user) {
        user = await this.userModel.findById(userId);
        if (!user) {
          throw new NotFoundException('User not found');
        }
        this.logger.log(
          `Another process already initialized calendar for user ${userId}`,
        );
        return user;
      }

      // Enable webhook for the dedicated calendar
      await this.enableUserWebhook(userId);

      // Create Inbox project if it doesn't exist
      await this.getOrCreateInboxProject(userId);

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
   * Each user has their own Inbox project
   */
  async getOrCreateInboxProject(userId: string): Promise<ProjectDocument> {
    let inboxProject = await this.projectModel.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      name: INBOX_PROJECT_NAME,
    });

    if (!inboxProject) {
      inboxProject = await this.projectModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        name: INBOX_PROJECT_NAME,
        description: 'Default project for tasks synced from Google Calendar',
        status: 'active',
        color: '#808080', // Gray color for inbox
      });
      this.logger.log(`Created Inbox project for user ${userId}`);
    }

    return inboxProject;
  }

  // ============================================
  // USER & CONNECTION HELPERS
  // ============================================

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId);
  }

  /**
   * Get ALL connected Google users (users with autoSyncEnabled)
   * Used for scheduled sync jobs
   */
  async getAllConnectedUsers(): Promise<UserDocument[]> {
    return this.userModel.find({
      autoSyncEnabled: true,
      dedicatedCalendarId: { $exists: true, $ne: null },
    });
  }

  /**
   * Get user by webhook channel ID (via ConnectedCalendar)
   */
  async getUserByWebhookChannel(
    channelId: string,
  ): Promise<{ user: UserDocument; calendar: ConnectedCalendarDocument } | null> {
    const calendar = await this.connectedCalendarModel.findOne({ webhookChannelId: channelId });
    if (!calendar) return null;
    
    const user = await this.userModel.findById(calendar.userId);
    if (!user) return null;
    
    return { user, calendar };
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
   * @param calendarId Optional: explicit calendar to sync to. If not provided, will look for existing mapping.
   */
  async syncTaskToGoogle(
    userId: string,
    taskId: string,
    calendarId?: string,
  ): Promise<TaskDocument> {
    await this.validateGoogleAuth(userId);

    const task = await this.taskModel.findById(taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check for existing mapping
    let mapping = await this.taskMappingModel.findOne({
      taskId: task._id,
      provider: 'google',
    });

    // If no mapping and no specific calendar requested, we DON'T sync (Explicit Sync Policy)
    if (!mapping && !calendarId) {
      return task; // Local only
    }

    // Determine target calendar
    const targetCalendarId = calendarId || mapping?.externalCalendarId;

    if (!targetCalendarId) {
      throw new BadRequestException('Target calendar not specified');
    }

    if (!task.date) {
      throw new BadRequestException('Task must have a date to sync');
    }

    // Get project for colorId
    const project = task.project
      ? await this.projectModel.findOne({ name: task.project })
      : null;

    const eventData = this.taskToEventData(task, project);

    try {
      let googleEvent: GoogleEvent;

      if (mapping) {
        // Update existing event
        try {
          googleEvent = await this.googleCalendarService.updateEvent(
            userId,
            mapping.externalCalendarId,
            mapping.externalEventId,
            eventData,
          );
        } catch (error) {
          // If 404/410, maybe event deleted. Re-create?
          // For now, if update fails, we might want to break the link or re-create
          if (error.message.includes('not found') || error.message.includes('deleted')) {
             this.logger.warn(`Event ${mapping.externalEventId} not found, re-creating link`);
             await this.taskMappingModel.deleteOne({ _id: mapping._id });
             mapping = null; // force re-create path
          } else {
             throw error;
          }
        }
      }

      if (!mapping) {
        // Create new event
        googleEvent = await this.googleCalendarService.createEvent(
          userId,
          targetCalendarId,
          eventData,
        );
      }

      // Re-check just in case we fell through from catch block
      if (!googleEvent! && !mapping) {
         // Should have been created above
         throw new Error('Failed to create event');
      }

      if (googleEvent!) {
          // Update or Create Mapping
          if (mapping) {
              mapping.lastSyncedAt = new Date();
              mapping.syncHash = this.computeSyncHash(task);
              await mapping.save();
          } else if (googleEvent.id) {
              await this.taskMappingModel.create({
                  taskId: task._id,
                  userId: task.userId,
                  provider: 'google',
                  externalEventId: googleEvent.id,
                  externalCalendarId: targetCalendarId,
                  lastSyncedAt: new Date(),
                  syncHash: this.computeSyncHash(task),
              });
          }
      }

      this.logger.log(`Task ${taskId} synced to Google Calendar (${targetCalendarId})`);
      return task;
    } catch (error) {
      this.logger.error(`Failed to sync task ${taskId}`, error);
      throw error;
    }
  }

  private computeSyncHash(task: TaskDocument): string {
      return JSON.stringify({
          t: task.title,
          d: task.description,
          dt: task.date?.toISOString(),
          tm: task.time,
      });
  }

  /**
   * Auto-sync task to Google (called from TasksService)
   */
  async autoSyncTaskToGoogle(taskId: string): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId);
      if (!task || !task.date || !task.userId) {
        return;
      }

      // IMPORTANT: Use the task's owner, not just any connected user
      const userId = task.userId.toString();
      const user = await this.userModel.findById(userId);
      // Removed autoSyncEnabled check - we rely on TaskMapping existence
      if (!user) {
        return;
      }

      const hasAuth = await this.authService.hasValidGoogleAuth(userId);
      if (!hasAuth) {
        this.logger.warn(
          `Auto-sync skipped for task ${taskId}: No valid Google auth`,
        );
        return;
      }

      await this.syncTaskToGoogle(userId, taskId);
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
      if (!task.userId) {
        return;
      }

      // IMPORTANT: Use the task's owner, not just any connected user
      const userId = task.userId.toString();
      
      // Check auth only
      const hasAuth = await this.authService.hasValidGoogleAuth(userId);
      if (!hasAuth) {
        return;
      }

      const mapping = await this.taskMappingModel.findOne({ taskId: task._id, provider: 'google' });
      if (!mapping) return;

      await this.googleCalendarService.deleteEvent(
        userId,
        mapping.externalCalendarId,
        mapping.externalEventId,
      );
      
      await this.taskMappingModel.deleteOne({ _id: mapping._id });

      this.logger.log(
        `Auto-deleted event ${mapping.externalEventId} from Google Calendar`,
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

    // IMPORTANT: Only sync tasks belonging to this user
    // AND only sync tasks that have a mapping already (Explicit Sync)
    // Or we could implement a "Sync All" feature, but user asked for Explicit.
    // For "Sync All Tasks" button, maybe we assume "Primary" calendar? 
    // Let's stick to syncing only mapped tasks for this generic method, 
    // or maybe deprecated it if we don't have a specific flow.
    // Actually, "Sync All" usually means "Push everything".
    // For now, let's just sync tasks that HAVE mappings.
    const mappings = await this.taskMappingModel.find({ userId: new mongoose.Types.ObjectId(userId), provider: 'google' });
    const taskIds = mappings.map(m => m.taskId);
    
    const tasks = await this.taskModel.find({
      _id: { $in: taskIds },
      date: { $exists: true, $ne: null },
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
   * Check if a calendar is a holiday/readonly calendar that should not be synced
   */
  private isHolidayCalendar(calendarId: string): boolean {
    // Google holiday calendars follow this pattern
    const holidayPatterns = [
      '#holiday@group.v.calendar.google.com',
      '#contacts@group.v.calendar.google.com',
      '#weeknum@group.v.calendar.google.com',
      'addressbook#contacts@group.v.calendar.google.com',
    ];
    return holidayPatterns.some(pattern => calendarId.includes(pattern));
  }

  /**
   * Sync events from Google Calendar to tasks
   * IMPORTANT: Only syncs from primary calendar or calendars marked as isSynced
   * Never syncs from holiday/readonly calendars
   */
  async syncGoogleEventsToTasks(userId: string, calendarId?: string): Promise<SyncResult> {
    await this.validateGoogleAuth(userId);

    let calendarsToSync: { id: string; name: string }[] = [];

    if (calendarId) {
      // Skip if this is a holiday calendar
      if (this.isHolidayCalendar(calendarId)) {
        this.logger.log(`Skipping holiday calendar: ${calendarId}`);
        return { success: true, synced: 0, failed: 0, errors: [] };
      }
      calendarsToSync = [{ id: calendarId, name: calendarId }];
    } else {
      // Get ONLY syncable calendars: primary OR marked as isSynced
      // Exclude holiday calendars
      const connectedCalendars = await this.connectedCalendarModel.find({
        userId,
        provider: 'google',
        $or: [
          { isPrimary: true },
          { isSynced: true }
        ]
      });

      calendarsToSync = connectedCalendars
        .filter(c => !this.isHolidayCalendar(c.externalId))
        .map(c => ({ id: c.externalId, name: c.name }));

      // Fallback to 'primary' if no calendars found
      if (calendarsToSync.length === 0) {
        calendarsToSync = [{ id: 'primary', name: 'Primary Calendar' }];
      }
    }

    this.logger.log(`Syncing events from ${calendarsToSync.length} calendar(s) for user ${userId}`);

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAhead = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    for (const cal of calendarsToSync) {
        try {
            const events = await this.googleCalendarService.listEvents(
              userId,
              cal.id,
              threeMonthsAgo,
              sixMonthsAhead,
            );

            // Also sync to CalendarEvent cache for fast retrieval
            await this.syncEventsToCache(userId, cal.id, events);

            for (const event of events) {
              try {
                await this.syncEventToTask(event, userId, cal.id);
                result.synced++;
              } catch (error) {
                result.failed++;
                result.errors.push(`Event "${event.summary}": ${error.message}`);
              }
            }

            // Handle deleted events (also cleans CalendarEvent cache)
            const deletedCount = await this.handleDeletedGoogleEvents(
              cal.id,
              events,
              userId,
            );
            result.synced += deletedCount;

        } catch (error) {
             result.failed++;
             result.errors.push(`Calendar ${cal.name}: ${error.message}`);
        }
    }
    
    result.success = result.failed === 0;
    this.logger.log(
      `Synced ${result.synced} events from Google, ${result.failed} failed`
    );
    return result;
  }

  /**
   * Sync a single Google event to a task
   */
  private async syncEventToTask(
    event: GoogleEvent,
    userId: string,
    calendarId: string,
  ): Promise<TaskDocument> {
    const taskId = event.extendedProperties?.private?.axis_task_id;

    let task: TaskDocument | null = null;
    let mapping: TaskMappingDocument | null = null;

    // 1. Try to find by TaskMapping first (Robust)
    if (event.id) {
        mapping = await this.taskMappingModel.findOne({
            externalEventId: event.id,
            provider: 'google'
        });
        if (mapping) {
            task = await this.taskModel.findById(mapping.taskId);
        }
    }

    // 2. Fallback: extendedProperties (Legacy/Direct)
    if (!task && taskId) {
      task = await this.taskModel.findById(taskId);
    }

    // 3. Fallback: googleEventId (Legacy Schema)
    if (!task && event.id) {
       task = await this.taskModel.findOne({ googleEventId: event.id });
    }

    const { date, time } = this.parseEventDateTime(event);

    // 4. Fallback: Heuristic Match (Title + Date) to prevent duplicates upon re-connection
    // This handles the case where users disconnect (wiping mappings) and reconnect
    if (!task) {
        task = await this.taskModel.findOne({
            userId: new Types.ObjectId(userId),
            title: event.summary,
            date: date,
        });

        if (task) {
            this.logger.log(`Heuristically matched task "${task.title}" for event ${event.summary}`);
        }
    }

    if (task) {
      // Update existing task
      task.title = event.summary || task.title;
      task.description = event.description ?? task.description;
      task.date = date;
      task.time = time;
      task.lastSyncedAt = new Date();
      // Ensure local auth ownership
      if (!task.userId) {
        task.userId = new mongoose.Types.ObjectId(userId);
      }
      await task.save();

      // Ensure mapping exists with correct calendarId
      if (!mapping && event.id) {
          await this.taskMappingModel.create({
              taskId: task._id,
              userId: task.userId,
              provider: 'google',
              externalEventId: event.id,
              externalCalendarId: calendarId,
              lastSyncedAt: new Date(),
              syncHash: this.computeSyncHash(task),
          });
      } else if (mapping && mapping.externalCalendarId !== calendarId) {
          // Update calendarId if it changed
          mapping.externalCalendarId = calendarId;
          await mapping.save();
      }

      return task;
    }

    // Create new task (Import)
    await this.getOrCreateInboxProject(userId);

    const newTask = await this.taskModel.create({
      title: event.summary || 'Untitled Event',
      description: event.description ?? undefined,
      project: INBOX_PROJECT_NAME,
      date,
      time,
      lastSyncedAt: new Date(),
      status: 'todo',
      completed: false,
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (event.id) {
         await this.taskMappingModel.create({
              taskId: newTask._id,
              userId: newTask.userId,
              provider: 'google',
              externalEventId: event.id,
              externalCalendarId: calendarId,
              lastSyncedAt: new Date(),
              syncHash: this.computeSyncHash(newTask),
          });
    }

    this.logger.log(`Created task "${newTask.title}" from Google event`);
    return newTask;
  }

  /**
   * Sync events to CalendarEvent cache for fast retrieval
   */
  private async syncEventsToCache(
    userId: string,
    calendarId: string,
    events: GoogleEvent[],
  ): Promise<void> {
    const syncStart = new Date();

    for (const event of events) {
      if (!event.id) continue;

      const eventData = {
        userId: new Types.ObjectId(userId),
        provider: 'google' as const,
        externalId: event.id,
        calendarId,
        title: event.summary || 'Untitled',
        description: event.description || undefined,
        start: this.parseEventDate(event.start),
        end: this.parseEventDate(event.end),
        allDay: !event.start?.dateTime,
        status: (event.status as 'confirmed' | 'tentative' | 'cancelled') || 'confirmed',
        lastSyncedAt: syncStart,
      };

      await this.calendarEventModel.findOneAndUpdate(
        { userId: eventData.userId, externalId: event.id } as any,
        eventData as any,
        { upsert: true, new: true }
      );
    }

    this.logger.log(`Cached ${events.length} events for calendar ${calendarId}`);
  }

  private parseEventDate(eventDate?: { dateTime?: string | null; date?: string | null }): Date {
    if (eventDate?.dateTime) return new Date(eventDate.dateTime);
    if (eventDate?.date) return new Date(eventDate.date);
    return new Date();
  }

  /**
   * Handle events that were deleted from Google Calendar
   * Also cleans up CalendarEvent cache
   */
  private async handleDeletedGoogleEvents(
    calendarId: string,
    currentEvents: GoogleEvent[],
    userId: string,
  ): Promise<number> {
    const currentEventIds = new Set(currentEvents.map((e) => e.id).filter(Boolean));

    // Find mappings for this specific calendar
    const mappings = await this.taskMappingModel.find({
        userId: new mongoose.Types.ObjectId(userId),
        provider: 'google',
        externalCalendarId: calendarId,
    });

    let deletedCount = 0;
    const deletedEventIds: string[] = [];

    for (const mapping of mappings) {
      if (!currentEventIds.has(mapping.externalEventId)) {
          // Event deleted on Google -> Mark task as done
          const task = await this.taskModel.findById(mapping.taskId);
          if (task) {
              task.status = 'done';
              task.completed = true;
              await task.save();
          }
          await this.taskMappingModel.deleteOne({ _id: mapping._id });
          deletedEventIds.push(mapping.externalEventId);
          deletedCount++;
      }
    }

    // Also clean up CalendarEvent cache
    if (deletedEventIds.length > 0) {
      await this.calendarEventModel.deleteMany({
        userId: new Types.ObjectId(userId),
        externalId: { $in: deletedEventIds },
      } as any);
      this.logger.log(`Cleaned ${deletedEventIds.length} deleted events from cache`);
    }

    // Mark any remaining orphaned cache events as cancelled
    await this.calendarEventModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        calendarId,
        externalId: { $nin: Array.from(currentEventIds) },
        status: { $ne: 'cancelled' },
      } as any,
      { $set: { status: 'cancelled' } }
    );

    return deletedCount;
  }

  // ============================================
  // WEBHOOK MANAGEMENT
  // ============================================

  /**
   * Enable webhooks for ALL synced calendars of a user
   */
  async enableUserWebhook(userId: string): Promise<void> {
    await this.validateGoogleAuth(userId);

    // Watch all connected calendars. 
    // In future filter by `isSynced` if we add that toggle.
    // Watch only Primary or Synced calendars
    const calendars = await this.connectedCalendarModel.find({ 
        userId, 
        provider: 'google',
        $or: [
            { isPrimary: true },
            { isSynced: true }
        ]
    });

    for (const calendar of calendars) {
        // Skip holiday calendars
        if (this.isHolidayCalendar(calendar.externalId)) {
            continue;
        }

        try {
            // Stop existing if any
            if (calendar.webhookChannelId && calendar.webhookResourceId) {
                 await this.googleCalendarService.stopWatch(
                    userId,
                    calendar.webhookChannelId,
                    calendar.webhookResourceId
                 );
            }

            const webhookUrl = this.getWebhookUrl();
            const watchData = await this.googleCalendarService.watchCalendar(
                userId,
                calendar.externalId,
                webhookUrl
            );

            calendar.webhookChannelId = watchData.channelId;
            calendar.webhookResourceId = watchData.resourceId;
            calendar.webhookExpiration = new Date(Number(watchData.expiration));
            await calendar.save();
            
            this.logger.log(`Webhook enabled for calendar ${calendar.name} (${calendar.externalId})`);

        } catch (error) {
             this.logger.error(`Failed to enable webhook for calendar ${calendar.externalId}`, error);
        }
    }
  }

  /**
   * Disable webhook for user's calendars
   */
  async disableUserWebhook(userId: string): Promise<void> {
    // Disable all
    const calendars = await this.connectedCalendarModel.find({ 
        userId, 
        provider: 'google',
        webhookChannelId: { $ne: null }
    });
    
    for (const calendar of calendars) {
        if (!calendar.webhookChannelId || !calendar.webhookResourceId) continue;
        
        try {
             await this.googleCalendarService.stopWatch(
                userId,
                calendar.webhookChannelId,
                calendar.webhookResourceId
             );
             
             calendar.webhookChannelId = undefined;
             calendar.webhookResourceId = undefined;
             calendar.webhookExpiration = undefined;
             await calendar.save();
             
        } catch (error) {
            this.logger.warn(`Failed to stop watch for calendar ${calendar.externalId}`);
        }
    }
    
    this.logger.log(`Webhooks disabled for user ${userId}`);
  }

  /**
   * Handle incoming webhook notification from Google
   */
  async handleWebhookNotification(
    channelId: string,
    resourceId: string,
  ): Promise<void> {
    this.logger.log(`Processing webhook notification: channelId=${channelId}`);

    const result = await this.getUserByWebhookChannel(channelId);
    if (!result) {
      this.logger.warn(`No user/calendar found for webhook channelId: ${channelId}`);
      return;
    }
    
    const { user, calendar } = result;

    try {
      const hasAuth = await this.authService.hasValidGoogleAuth(
        user._id.toString(),
      );
      if (!hasAuth) {
        this.logger.warn(`User ${user._id} has no valid Google auth`);
        return;
      }

      // Sync events to DB cache (for calendar view)
      // Note: CalendarsService is injected or we call it via events directly
      // For now, just sync tasks. Events sync can be added when CalendarsService is injected.
      
      // Sync specific calendar to Tasks
      await this.syncGoogleEventsToTasks(user._id.toString(), calendar.externalId);
      this.logger.log(`Webhook sync completed for user ${user._id}, calendar ${calendar.name}`);
    } catch (error) {
      this.logger.error(`Webhook sync failed for user ${user._id}`, error);
    }
  }

  /**
   * Refresh webhooks that are about to expire
   * Uses ConnectedCalendar model (not deprecated User fields)
   */
  async refreshExpiredWebhooks(): Promise<{
    refreshed: number;
    failed: number;
  }> {
    const now = new Date();
    const buffer = 24 * 60 * 60 * 1000; // 1 day buffer
    const expirationThreshold = new Date(now.getTime() + buffer);

    // Find calendars with webhooks expiring soon
    const calendarsNeedingRefresh = await this.connectedCalendarModel.find({
      provider: 'google',
      webhookChannelId: { $exists: true, $ne: null },
      webhookExpiration: { $lt: expirationThreshold },
    });

    // Group by userId to batch refresh
    const userIds = [...new Set(calendarsNeedingRefresh.map(c => c.userId.toString()))];

    let refreshed = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        // Check if user still has autoSync enabled
        const user = await this.userModel.findById(userId);
        if (!user?.autoSyncEnabled) continue;

        await this.enableUserWebhook(userId);
        refreshed++;
      } catch (error) {
        failed++;
        this.logger.error(`Failed to refresh webhook for user ${userId}`, error);
      }
    }

    this.logger.log(`Refreshed webhooks for ${refreshed} users, ${failed} failed`);
    return { refreshed, failed };
  }

  /**
   * Enable webhooks for all users with auto-sync but no webhook
   * Finds users who have calendars without webhooks configured
   */
  async enableWebhooksForAllConnectedUsers(): Promise<{
    enabled: number;
    failed: number;
  }> {
    // Find users with autoSync enabled
    const users = await this.userModel.find({
      autoSyncEnabled: true,
      dedicatedCalendarId: { $exists: true, $ne: null },
    });

    let enabled = 0;
    let failed = 0;

    for (const user of users) {
      try {
        // Check if user has any calendars without webhooks
        const calendarsWithoutWebhook = await this.connectedCalendarModel.findOne({
          userId: user._id,
          provider: 'google',
          $or: [
            { webhookChannelId: { $exists: false } },
            { webhookChannelId: null },
          ],
        });

        if (calendarsWithoutWebhook) {
          await this.enableUserWebhook(user._id.toString());
          enabled++;
        }
      } catch (error) {
        failed++;
        this.logger.error(`Failed to enable webhook for user ${user._id}`, error);
      }
    }

    this.logger.log(`Enabled webhooks for ${enabled} users, ${failed} failed`);
    return { enabled, failed };
  }

  // ============================================
  // DISCONNECT / CLEANUP
  // ============================================

  /**
   * Disconnect user from Google Calendar sync
   * Cleans up all sync data including webhooks, mappings, and cache
   */
  async disconnectSync(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      // Stop webhooks for all connected calendars
      const calendars = await this.connectedCalendarModel.find({
        userId,
        provider: 'google',
        webhookChannelId: { $exists: true, $ne: null },
      });

      for (const calendar of calendars) {
        if (calendar.webhookChannelId && calendar.webhookResourceId) {
          try {
            await this.googleCalendarService.stopWatch(
              userId,
              calendar.webhookChannelId,
              calendar.webhookResourceId,
            );
          } catch (err) {
            this.logger.warn(`Failed to stop webhook for calendar ${calendar.externalId}`);
          }
        }
      }

      // Clear webhook fields from connected calendars
      await this.connectedCalendarModel.updateMany(
        { userId },
        {
          $unset: {
            webhookChannelId: 1,
            webhookResourceId: 1,
            webhookExpiration: 1,
          },
        },
      );

      // Clear all sync-related fields from user (including deprecated fields)
      user.dedicatedCalendarId = undefined;
      user.autoSyncEnabled = false;
      user.webhookChannelId = undefined;
      user.webhookResourceId = undefined;
      user.webhookExpiration = undefined;
      await user.save();

      // Clean up TaskMappings
      await this.taskMappingModel.deleteMany({
        userId: new mongoose.Types.ObjectId(userId),
        provider: 'google',
      });

      // Clean up CalendarEvent cache
      await this.calendarEventModel.deleteMany({
        userId: new Types.ObjectId(userId),
        provider: 'google',
      } as any);

      // Clear googleEventId from tasks (deprecated field)
      await this.taskModel.updateMany(
        {
          userId: new mongoose.Types.ObjectId(userId),
          googleEventId: { $exists: true },
        },
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
    // Parse date and optional time
    const taskDate = new Date(task.date);
    let startDateTime = taskDate;
    
    // If time is specified, combine date + time
    if (task.time) {
      const [hours, minutes] = task.time.split(':').map(Number);
      startDateTime = new Date(taskDate);
      startDateTime.setHours(hours, minutes, 0, 0);
    }

    // Default to 1 hour duration for calendar events
    const endDateTime = new Date(startDateTime.getTime() + this.defaultEventDuration);

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
    date: Date;
    time?: string;
  } {
    let eventDate: Date;
    let eventTime: string | undefined;

    if (event.start?.dateTime) {
      const dt = new Date(event.start.dateTime);
      eventDate = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); // Date only
      eventTime = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    } else if (event.start?.date) {
      eventDate = new Date(event.start.date);
      // All-day event, no time
    } else {
      eventDate = new Date();
    }

    return { date: eventDate, time: eventTime };
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
