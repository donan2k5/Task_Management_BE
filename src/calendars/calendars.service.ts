import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConnectedCalendar, ConnectedCalendarDocument } from './schemas/connected-calendar.schema';
import { CalendarEvent, CalendarEventDocument } from './schemas/calendar-event.schema';
import { GoogleCalendarService, GoogleEvent } from '../google-calendar/google-calendar.service';

@Injectable()
export class CalendarsService {
  private readonly logger = new Logger(CalendarsService.name);

  constructor(
    @InjectModel(ConnectedCalendar.name) private calendarModel: Model<ConnectedCalendarDocument>,
    @InjectModel(CalendarEvent.name) private eventModel: Model<CalendarEventDocument>,
    private googleCalendarService: GoogleCalendarService,
  ) {}

  // ==================== CONNECTED CALENDARS ====================

  async findAllCalendars(userId: string): Promise<ConnectedCalendar[]> {
    return this.calendarModel.find({ userId }).sort({ isPrimary: -1, name: 1 });
  }

  async refreshCalendars(userId: string): Promise<ConnectedCalendar[]> {
    try {
      const googleCalendars = await this.googleCalendarService.listCalendars(userId);
      const result: ConnectedCalendar[] = [];
      
      for (const cal of googleCalendars) {
        if (!cal.id) continue;

        const updated = await this.calendarModel.findOneAndUpdate(
          { userId, provider: 'google', externalId: cal.id } as any,
          {
            name: cal.name || 'Untitled Calendar',
            description: cal.description,
            isPrimary: cal.primary,
            isWritable: cal.accessRole === 'owner' || cal.accessRole === 'writer',
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        result.push(updated!);
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to refresh calendars for user ${userId}`, error);
      throw error;
    }
  }

  // ==================== CALENDAR EVENTS (CACHED) ====================

  /**
   * Get events from DB cache (FAST!)
   */
  async getEvents(userId: string, start: Date, end: Date, calendarId?: string): Promise<CalendarEventDocument[]> {
    const query: any = {
      userId: new Types.ObjectId(userId),
      start: { $lte: end },
      end: { $gte: start },
      status: { $ne: 'cancelled' },
    };
    
    if (calendarId) {
      query.calendarId = calendarId;
    }

    return this.eventModel.find(query).sort({ start: 1 });
  }

  /**
   * Sync events from Google to DB for a specific calendar
   */
  async syncEventsFromGoogle(userId: string, calendarId: string, start?: Date, end?: Date): Promise<number> {
    const now = new Date();
    const syncStart = start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const syncEnd = end || new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days ahead

    try {
      const events = await this.googleCalendarService.listEvents(userId, calendarId, syncStart, syncEnd);
      let syncedCount = 0;

      for (const event of events) {
        if (!event.id) continue;

        await this.upsertEventFromGoogle(userId, calendarId, event);
        syncedCount++;
      }

      // Mark deleted events
      const currentEventIds = events.map(e => e.id).filter((id): id is string => !!id);
      await this.eventModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
          calendarId,
          externalId: { $nin: currentEventIds },
          start: { $gte: syncStart, $lte: syncEnd },
        } as any,
        { $set: { status: 'cancelled' } }
      );

      this.logger.log(`Synced ${syncedCount} events for calendar ${calendarId}`);
      return syncedCount;
    } catch (error) {
      this.logger.error(`Failed to sync events for calendar ${calendarId}`, error);
      throw error;
    }
  }

  /**
   * Sync ALL calendars for a user
   */
  async syncAllCalendarsEvents(userId: string): Promise<number> {
    const calendars = await this.calendarModel.find({ userId, provider: 'google' });
    let totalSynced = 0;

    for (const cal of calendars) {
      try {
        const count = await this.syncEventsFromGoogle(userId, cal.externalId);
        totalSynced += count;
      } catch (error) {
        this.logger.error(`Failed to sync calendar ${cal.externalId}`, error);
      }
    }

    return totalSynced;
  }

  /**
   * Upsert a single event from Google
   */
  private async upsertEventFromGoogle(userId: string, calendarId: string, event: GoogleEvent): Promise<CalendarEventDocument> {
    const eventData = {
      userId: new Types.ObjectId(userId),
      provider: 'google' as const,
      externalId: event.id!,
      calendarId,
      title: event.summary || 'Untitled',
      description: event.description || undefined,
      start: this.parseEventDate(event.start),
      end: this.parseEventDate(event.end),
      allDay: !event.start?.dateTime,
      location: (event as any).location || undefined,
      status: (event.status as 'confirmed' | 'tentative' | 'cancelled') || 'confirmed',
      lastSyncedAt: new Date(),
    };

    return (await this.eventModel.findOneAndUpdate(
      { userId: eventData.userId, externalId: event.id } as any,
      eventData as any,
      { upsert: true, new: true }
    ))!;
  }

  private parseEventDate(eventDate?: { dateTime?: string | null; date?: string | null }): Date {
    if (eventDate?.dateTime) return new Date(eventDate.dateTime);
    if (eventDate?.date) return new Date(eventDate.date);
    return new Date();
  }

  /**
   * Save a single event to cache (called after creating on Google)
   */
  async saveEventToCache(
    userId: string,
    calendarId: string,
    event: { id: string; summary?: string | null; description?: string | null; start?: { dateTime?: string | null; date?: string | null }; end?: { dateTime?: string | null; date?: string | null }; status?: string | null; location?: string | null }
  ): Promise<CalendarEventDocument> {
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
      location: (event as any).location || undefined,
      status: (event.status as 'confirmed' | 'tentative' | 'cancelled') || 'confirmed',
      lastSyncedAt: new Date(),
    };

    return (await this.eventModel.findOneAndUpdate(
      { userId: eventData.userId, externalId: event.id } as any,
      eventData as any,
      { upsert: true, new: true }
    ))!;
  }

  /**
   * Delete event from cache
   */
  async deleteEventFromCache(userId: string, externalId: string): Promise<void> {
    await this.eventModel.deleteOne({
      userId: new Types.ObjectId(userId),
      externalId,
    } as any);
  }

  // ==================== WEBHOOK HANDLER ====================

  /**
   * Called when webhook notification received - sync only that calendar
   */
  async handleCalendarWebhook(userId: string, calendarId: string): Promise<void> {
    this.logger.log(`Webhook triggered sync for user ${userId}, calendar ${calendarId}`);
    await this.syncEventsFromGoogle(userId, calendarId);
  }

  // ==================== SYNC TOGGLE ====================

  /**
   * Toggle isSynced flag for a calendar
   * This controls whether the calendar's events are synced bidirectionally
   */
  async toggleCalendarSync(
    userId: string,
    calendarId: string,
    isSynced: boolean,
  ): Promise<ConnectedCalendar | null> {
    const calendar = await this.calendarModel.findOneAndUpdate(
      { userId, externalId: calendarId },
      { $set: { isSynced } },
      { new: true }
    );

    if (calendar) {
      this.logger.log(`Calendar ${calendarId} sync ${isSynced ? 'enabled' : 'disabled'} for user ${userId}`);
    }

    return calendar;
  }

  /**
   * Get calendars that are enabled for sync
   * Returns only primary calendar or calendars marked as isSynced
   */
  async getSyncableCalendars(userId: string): Promise<ConnectedCalendar[]> {
    return this.calendarModel.find({
      userId,
      provider: 'google',
      $or: [
        { isPrimary: true },
        { isSynced: true }
      ]
    }).sort({ isPrimary: -1, name: 1 });
  }
}

