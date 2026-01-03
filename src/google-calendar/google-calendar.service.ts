import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from '../auth/auth.service';

export interface CalendarData {
  id: string | null | undefined;
  name: string | null | undefined;
  description?: string | null;
  primary: boolean;
  accessRole: string | null | undefined;
}

export interface ExtendedProperties {
  axis_project_id?: string;
  axis_task_id?: string;
}

export interface EventData {
  id?: string;
  title: string;
  description?: string;
  startDateTime: Date;
  endDateTime: Date;
  timeZone?: string;
  colorId?: string; // Google event color (1-11)
  extendedProperties?: ExtendedProperties;
}

export interface EventDateTime {
  dateTime?: string | null;
  date?: string | null;
  timeZone?: string | null;
}

export interface GoogleEvent {
  id: string | null | undefined;
  summary: string | null | undefined;
  description?: string | null;
  start?: EventDateTime;
  end?: EventDateTime;
  status?: string | null;
  colorId?: string | null;
  extendedProperties?: {
    private?: { [key: string]: string | null | undefined };
  } | null;
}

export interface WatchChannelData {
  channelId: string;
  resourceId: string;
  expiration: Date;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly defaultTimeZone = 'Asia/Ho_Chi_Minh';

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {}

  private async getCalendarClient(
    userId: string,
  ): Promise<calendar_v3.Calendar> {
    const accessToken = await this.authService.getGoogleAccessToken(userId);

    const oauth2Client = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
    );

    oauth2Client.setCredentials({ access_token: accessToken });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async listCalendars(userId: string): Promise<CalendarData[]> {
    try {
      const calendar = await this.getCalendarClient(userId);
      const response = await calendar.calendarList.list();

      return (response.data.items || []).map((item) => ({
        id: item.id,
        name: item.summary,
        description: item.description,
        primary: item.primary || false,
        accessRole: item.accessRole,
      }));
    } catch (error) {
      this.logger.error(`Failed to list calendars for user ${userId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async createCalendar(
    userId: string,
    name: string,
    description?: string,
  ): Promise<CalendarData> {
    try {
      const calendar = await this.getCalendarClient(userId);

      const response = await calendar.calendars.insert({
        requestBody: {
          summary: name,
          description,
          timeZone: this.defaultTimeZone,
        },
      });

      this.logger.log(`Created calendar "${name}" for user ${userId}`);

      return {
        id: response.data.id,
        name: response.data.summary,
        description: response.data.description,
        primary: false,
        accessRole: 'owner',
      };
    } catch (error) {
      this.logger.error(`Failed to create calendar for user ${userId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async updateCalendar(
    userId: string,
    calendarId: string,
    name: string,
    description?: string,
  ): Promise<CalendarData> {
    try {
      const calendar = await this.getCalendarClient(userId);

      const response = await calendar.calendars.update({
        calendarId,
        requestBody: {
          summary: name,
          description,
        },
      });

      this.logger.log(`Updated calendar ${calendarId} for user ${userId}`);

      return {
        id: response.data.id,
        name: response.data.summary,
        description: response.data.description,
        primary: false,
        accessRole: 'owner',
      };
    } catch (error) {
      this.logger.error(`Failed to update calendar ${calendarId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async deleteCalendar(userId: string, calendarId: string): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(userId);
      await calendar.calendars.delete({ calendarId });
      this.logger.log(`Deleted calendar ${calendarId} for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to delete calendar ${calendarId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async listEvents(
    userId: string,
    calendarId: string,
    timeMin?: Date,
    timeMax?: Date,
  ): Promise<GoogleEvent[]> {
    try {
      const calendar = await this.getCalendarClient(userId);

      const response = await calendar.events.list({
        calendarId,
        timeMin: timeMin?.toISOString(),
        timeMax: timeMax?.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return (response.data.items || []).map((item) => ({
        id: item.id,
        summary: item.summary,
        description: item.description,
        start: item.start,
        end: item.end,
        status: item.status,
        colorId: item.colorId,
        extendedProperties: item.extendedProperties,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to list events for calendar ${calendarId}`,
        error,
      );
      this.handleGoogleApiError(error);
    }
  }

  async createEvent(
    userId: string,
    calendarId: string,
    eventData: EventData,
  ): Promise<GoogleEvent> {
    try {
      const calendar = await this.getCalendarClient(userId);

      // Validate dates before using them
      if (
        !eventData.startDateTime ||
        !eventData.endDateTime ||
        isNaN(eventData.startDateTime.getTime()) ||
        isNaN(eventData.endDateTime.getTime())
      ) {
        throw new Error('Invalid startDateTime or endDateTime');
      }

      const requestBody: any = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startDateTime.toISOString(),
          timeZone: eventData.timeZone || this.defaultTimeZone,
        },
        end: {
          dateTime: eventData.endDateTime.toISOString(),
          timeZone: eventData.timeZone || this.defaultTimeZone,
        },
      };

      if (eventData.colorId) {
        requestBody.colorId = eventData.colorId;
      }

      if (eventData.extendedProperties) {
        requestBody.extendedProperties = {
          private: eventData.extendedProperties,
        };
      }

      const response = await calendar.events.insert({
        calendarId,
        requestBody,
      });

      this.logger.log(
        `Created event "${eventData.title}" in calendar ${calendarId}`,
      );

      return {
        id: response.data.id,
        summary: response.data.summary,
        description: response.data.description,
        start: response.data.start,
        end: response.data.end,
        status: response.data.status,
        colorId: response.data.colorId,
        extendedProperties: response.data.extendedProperties,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create event in calendar ${calendarId}`,
        error,
      );
      this.handleGoogleApiError(error);
    }
  }

  async updateEvent(
    userId: string,
    calendarId: string,
    eventId: string,
    eventData: EventData,
  ): Promise<GoogleEvent> {
    try {
      const calendar = await this.getCalendarClient(userId);

      // Validate dates before using them
      if (
        !eventData.startDateTime ||
        !eventData.endDateTime ||
        isNaN(eventData.startDateTime.getTime()) ||
        isNaN(eventData.endDateTime.getTime())
      ) {
        throw new Error('Invalid startDateTime or endDateTime');
      }

      const requestBody: any = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startDateTime.toISOString(),
          timeZone: eventData.timeZone || this.defaultTimeZone,
        },
        end: {
          dateTime: eventData.endDateTime.toISOString(),
          timeZone: eventData.timeZone || this.defaultTimeZone,
        },
      };

      if (eventData.colorId) {
        requestBody.colorId = eventData.colorId;
      }

      if (eventData.extendedProperties) {
        requestBody.extendedProperties = {
          private: eventData.extendedProperties,
        };
      }

      const response = await calendar.events.update({
        calendarId,
        eventId,
        requestBody,
      });

      this.logger.log(`Updated event ${eventId} in calendar ${calendarId}`);

      return {
        id: response.data.id,
        summary: response.data.summary,
        description: response.data.description,
        start: response.data.start,
        end: response.data.end,
        status: response.data.status,
        colorId: response.data.colorId,
        extendedProperties: response.data.extendedProperties,
      };
    } catch (error) {
      this.logger.error(`Failed to update event ${eventId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async deleteEvent(
    userId: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(userId);
      await calendar.events.delete({ calendarId, eventId });
      this.logger.log(`Deleted event ${eventId} from calendar ${calendarId}`);
    } catch (error) {
      this.logger.error(`Failed to delete event ${eventId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async getEvent(
    userId: string,
    calendarId: string,
    eventId: string,
  ): Promise<GoogleEvent | null> {
    try {
      const calendar = await this.getCalendarClient(userId);
      const response = await calendar.events.get({ calendarId, eventId });

      return {
        id: response.data.id,
        summary: response.data.summary,
        description: response.data.description,
        start: response.data.start,
        end: response.data.end,
        status: response.data.status,
        colorId: response.data.colorId,
        extendedProperties: response.data.extendedProperties,
      };
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      this.logger.error(`Failed to get event ${eventId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async findCalendarByName(
    userId: string,
    name: string,
  ): Promise<CalendarData | null> {
    const calendars = await this.listCalendars(userId);
    return calendars.find((cal) => cal.name === name) || null;
  }

  async watchCalendar(
    userId: string,
    calendarId: string,
    webhookUrl: string,
  ): Promise<WatchChannelData> {
    try {
      const calendar = await this.getCalendarClient(userId);
      // Channel ID must match [A-Za-z0-9\-_\+/=]+, so we sanitize the calendarId
      const sanitizedCalendarId = calendarId.replace(
        /[^A-Za-z0-9\-_+/=]/g,
        '_',
      );
      const channelId = `channel-${sanitizedCalendarId}-${Date.now()}`;

      const response = await calendar.events.watch({
        calendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
        },
      });

      const expiration = response.data.expiration
        ? new Date(parseInt(response.data.expiration))
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      this.logger.log(
        `Started watching calendar ${calendarId} for user ${userId}`,
      );

      return {
        channelId,
        resourceId: response.data.resourceId || '',
        expiration,
      };
    } catch (error) {
      this.logger.error(`Failed to watch calendar ${calendarId}`, error);
      this.handleGoogleApiError(error);
    }
  }

  async stopWatch(
    userId: string,
    channelId: string,
    resourceId: string,
  ): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(userId);

      await calendar.channels.stop({
        requestBody: {
          id: channelId,
          resourceId,
        },
      });

      this.logger.log(`Stopped watching channel ${channelId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to stop watch channel ${channelId}: ${error.message}`,
      );
    }
  }

  private handleGoogleApiError(error: any): never {
    const status = error?.response?.status;
    const message = error?.response?.data?.error?.message || error.message;

    switch (status) {
      case 401:
        throw new UnauthorizedException(
          'Google authentication expired. Please reconnect Google Calendar.',
        );
      case 403:
        throw new Error(
          `Insufficient permissions for Google Calendar: ${message}`,
        );
      case 404:
        throw new Error('Calendar or event not found on Google.');
      case 429:
        throw new Error(
          'Too many requests to Google Calendar. Please try again in a moment.',
        );
      default:
        throw new Error(`Google Calendar API error: ${message}`);
    }
  }
}
