import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CalendarProvider,
  CalendarEvent,
  Calendar,
  CreateEventDto,
  UpdateEventDto,
  ProviderConfig,
} from '../provider.interface';
import {
  GoogleCalendarService,
  GoogleEvent,
} from '../../google-calendar/google-calendar.service';
import { User, UserDocument } from '../../users/user.schema';
import { CalendarsService } from '../../calendars/calendars.service';

/**
 * Google Calendar Provider
 *
 * Implements CalendarProvider interface for Google Calendar integration.
 * Uses DB cache for fast reads, syncs from Google on demand.
 */
@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  readonly config: ProviderConfig = {
    id: 'google',
    name: 'Google Calendar',
    icon: 'google',
    color: '#4285F4',
    description: 'Sync with Google Calendar',
  };

  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => CalendarsService)) private calendarsService: CalendarsService,
  ) {}

  /**
   * Check if user has connected Google Calendar
   */
  async isConnected(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).lean();
    return !!(user?.googleId && user?.googleAccessToken);
  }

  /**
   * Get connection status details
   */
  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    email?: string;
    expiresAt?: Date;
  }> {
    const user = await this.userModel.findById(userId).lean();

    if (!user?.googleId || !user?.googleAccessToken) {
      return { connected: false };
    }

    return {
      connected: true,
      email: user.email,
      expiresAt: user.googleTokenExpiry,
    };
  }

  /**
   * Get all calendars for user (from DB cache)
   */
  async getCalendars(userId: string): Promise<Calendar[]> {
    // Get from DB cache first
    const cachedCalendars = await this.calendarsService.findAllCalendars(userId);
    
    if (cachedCalendars.length > 0) {
      return cachedCalendars.map((cal) => ({
        id: cal.externalId,
        providerId: this.config.id,
        name: cal.name,
        description: cal.description || undefined,
        primary: cal.isPrimary,
        accessRole: cal.isWritable ? 'writer' : 'reader',
        color: cal.color,
      }));
    }

    // Fallback: refresh from Google if no cache
    await this.calendarsService.refreshCalendars(userId);
    const refreshed = await this.calendarsService.findAllCalendars(userId);
    
    return refreshed.map((cal) => ({
      id: cal.externalId,
      providerId: this.config.id,
      name: cal.name,
      description: cal.description || undefined,
      primary: cal.isPrimary,
      accessRole: cal.isWritable ? 'writer' : 'reader',
      color: cal.color,
    }));
  }

  /**
   * Get events from DB cache - auto-syncs if cache is empty
   */
  async getEvents(
    userId: string,
    start: Date,
    end: Date,
    calendarId?: string,
  ): Promise<CalendarEvent[]> {
    // Resolve 'primary' to actual calendar ID
    let resolvedCalendarId = calendarId;
    if (calendarId === 'primary') {
      const primaryCalendar = await this.findPrimaryCalendar(userId);
      if (primaryCalendar) {
        resolvedCalendarId = primaryCalendar;
        this.logger.debug(`Resolved 'primary' to '${resolvedCalendarId}'`);
      } else {
        // If no primary found, don't filter by calendarId - get all events
        resolvedCalendarId = undefined;
      }
    }

    let cachedEvents = await this.calendarsService.getEvents(userId, start, end, resolvedCalendarId);

    // Auto-sync if cache is empty for this range
    if (cachedEvents.length === 0) {
      this.logger.log(`Cache empty for user ${userId}, syncing from Google...`);
      try {
        // Ensure calendars are in DB first
        await this.calendarsService.refreshCalendars(userId);
        // Then sync all calendar events
        await this.calendarsService.syncAllCalendarsEvents(userId);
        // Re-fetch from cache
        cachedEvents = await this.calendarsService.getEvents(userId, start, end, resolvedCalendarId);
      } catch (error) {
        this.logger.error(`Auto-sync failed for user ${userId}:`, error);
        // Fallback: return empty rather than crash
        return [];
      }
    }

    return cachedEvents.map((event) => ({
      id: event.externalId,
      providerId: this.config.id,
      calendarId: event.calendarId,
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      status: event.status,
      externalId: event.externalId,
      source: 'google',
    }));
  }

  /**
   * Find the primary calendar ID for a user
   */
  private async findPrimaryCalendar(userId: string): Promise<string | null> {
    const calendars = await this.calendarsService.findAllCalendars(userId);
    const primary = calendars.find(c => c.isPrimary);
    return primary?.externalId || null;
  }

  /**
   * Create event on Google Calendar and save to cache
   */
  async createEvent(
    userId: string,
    event: CreateEventDto,
  ): Promise<CalendarEvent> {
    const calendarId = event.calendarId || 'primary';

    const googleEvent = await this.googleCalendarService.createEvent(
      userId,
      calendarId,
      {
        title: event.title,
        description: event.description,
        startDateTime: event.start,
        endDateTime: event.end,
      },
    );

    // Save to DB cache immediately
    if (googleEvent.id) {
      await this.calendarsService.saveEventToCache(userId, calendarId, googleEvent as any);
    }

    return this.mapGoogleEventToCalendarEvent(googleEvent, calendarId);
  }

  /**
   * Update event on Google Calendar
   */
  async updateEvent(
    userId: string,
    calendarId: string,
    eventId: string,
    event: UpdateEventDto,
  ): Promise<CalendarEvent> {
    // Get existing event first to merge data
    const existing = await this.googleCalendarService.getEvent(
      userId,
      calendarId,
      eventId,
    );

    if (!existing) {
      throw new Error('Event not found');
    }

    const startDate = event.start || this.parseEventDate(existing.start);
    const endDate = event.end || this.parseEventDate(existing.end);

    const updated = await this.googleCalendarService.updateEvent(
      userId,
      calendarId,
      eventId,
      {
        title: event.title || existing.summary || 'Untitled',
        description: event.description ?? existing.description ?? undefined,
        startDateTime: startDate,
        endDateTime: endDate,
      },
    );

    // Update cache
    if (updated.id) {
      await this.calendarsService.saveEventToCache(userId, calendarId, updated as any);
    }

    return this.mapGoogleEventToCalendarEvent(updated, calendarId);
  }

  /**
   * Delete event from Google Calendar
   */
  async deleteEvent(
    userId: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    await this.googleCalendarService.deleteEvent(userId, calendarId, eventId);
    // Remove from cache
    await this.calendarsService.deleteEventFromCache(userId, eventId);
  }

  // ==================== Private Helpers ====================

  private mapGoogleEventToCalendarEvent(
    event: GoogleEvent,
    calendarId: string,
  ): CalendarEvent {
    return {
      id: event.id || '',
      providerId: this.config.id,
      calendarId,
      title: event.summary || 'Untitled',
      description: event.description || undefined,
      start: this.parseEventDate(event.start),
      end: this.parseEventDate(event.end),
      allDay: !event.start?.dateTime,
      status: this.mapEventStatus(event.status),
      externalId: event.id || undefined,
      source: 'google',
    };
  }

  private parseEventDate(eventDate?: {
    dateTime?: string | null;
    date?: string | null;
  }): Date {
    if (eventDate?.dateTime) {
      return new Date(eventDate.dateTime);
    }
    if (eventDate?.date) {
      return new Date(eventDate.date);
    }
    return new Date();
  }

  private mapAccessRole(role?: string | null): 'owner' | 'writer' | 'reader' {
    switch (role) {
      case 'owner':
        return 'owner';
      case 'writer':
        return 'writer';
      default:
        return 'reader';
    }
  }

  private mapEventStatus(
    status?: string | null,
  ): 'confirmed' | 'tentative' | 'cancelled' {
    switch (status) {
      case 'tentative':
        return 'tentative';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'confirmed';
    }
  }
}
