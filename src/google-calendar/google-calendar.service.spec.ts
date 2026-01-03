import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { GoogleCalendarService, EventData } from './google-calendar.service';
import { AuthService } from '../auth/auth.service';

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn().mockReturnValue({
      calendarList: {
        list: jest.fn(),
      },
      calendars: {
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      events: {
        list: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        get: jest.fn(),
        watch: jest.fn(),
      },
      channels: {
        stop: jest.fn(),
      },
    }),
  },
}));

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let mockAuthService: any;
  let mockConfigService: any;
  let mockCalendar: any;

  const mockUserId = 'user123';
  const mockCalendarId = 'calendar123';
  const mockEventId = 'event123';
  const mockAccessToken = 'mock-access-token';

  beforeEach(async () => {
    mockAuthService = {
      getGoogleAccessToken: jest.fn().mockResolvedValue(mockAccessToken),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarService,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<GoogleCalendarService>(GoogleCalendarService);

    // Get mock calendar from googleapis
    const { google } = require('googleapis');
    mockCalendar = google.calendar();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listCalendars', () => {
    it('should list all calendars for user', async () => {
      const mockCalendars = [
        {
          id: 'cal1',
          summary: 'Primary Calendar',
          description: 'Main calendar',
          primary: true,
          accessRole: 'owner',
        },
        {
          id: 'cal2',
          summary: 'Work Calendar',
          description: null,
          primary: false,
          accessRole: 'writer',
        },
      ];

      mockCalendar.calendarList.list.mockResolvedValue({
        data: { items: mockCalendars },
      });

      const result = await service.listCalendars(mockUserId);

      expect(mockAuthService.getGoogleAccessToken).toHaveBeenCalledWith(
        mockUserId,
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'cal1',
        name: 'Primary Calendar',
        description: 'Main calendar',
        primary: true,
        accessRole: 'owner',
      });
    });

    it('should return empty array when no calendars', async () => {
      mockCalendar.calendarList.list.mockResolvedValue({
        data: { items: null },
      });

      const result = await service.listCalendars(mockUserId);

      expect(result).toEqual([]);
    });

    it('should throw UnauthorizedException on 401 error', async () => {
      mockCalendar.calendarList.list.mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized',
      });

      await expect(service.listCalendars(mockUserId)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('createCalendar', () => {
    it('should create a new calendar', async () => {
      mockCalendar.calendars.insert.mockResolvedValue({
        data: {
          id: 'newcal123',
          summary: 'Axis',
          description: 'Task calendar',
        },
      });

      const result = await service.createCalendar(
        mockUserId,
        'Axis',
        'Task calendar',
      );

      expect(mockCalendar.calendars.insert).toHaveBeenCalledWith({
        requestBody: {
          summary: 'Axis',
          description: 'Task calendar',
          timeZone: 'Asia/Ho_Chi_Minh',
        },
      });
      expect(result).toEqual({
        id: 'newcal123',
        name: 'Axis',
        description: 'Task calendar',
        primary: false,
        accessRole: 'owner',
      });
    });

    it('should create calendar without description', async () => {
      mockCalendar.calendars.insert.mockResolvedValue({
        data: {
          id: 'newcal123',
          summary: 'Axis',
        },
      });

      const result = await service.createCalendar(mockUserId, 'Axis');

      expect(mockCalendar.calendars.insert).toHaveBeenCalledWith({
        requestBody: {
          summary: 'Axis',
          description: undefined,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
      });
      expect(result.name).toBe('Axis');
    });
  });

  describe('updateCalendar', () => {
    it('should update calendar', async () => {
      mockCalendar.calendars.update.mockResolvedValue({
        data: {
          id: mockCalendarId,
          summary: 'Updated Name',
          description: 'Updated description',
        },
      });

      const result = await service.updateCalendar(
        mockUserId,
        mockCalendarId,
        'Updated Name',
        'Updated description',
      );

      expect(mockCalendar.calendars.update).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
        requestBody: {
          summary: 'Updated Name',
          description: 'Updated description',
        },
      });
      expect(result.name).toBe('Updated Name');
    });
  });

  describe('deleteCalendar', () => {
    it('should delete calendar', async () => {
      mockCalendar.calendars.delete.mockResolvedValue({});

      await service.deleteCalendar(mockUserId, mockCalendarId);

      expect(mockCalendar.calendars.delete).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
      });
    });

    it('should throw on 404 error', async () => {
      mockCalendar.calendars.delete.mockRejectedValue({
        response: { status: 404 },
        message: 'Not found',
      });

      await expect(
        service.deleteCalendar(mockUserId, mockCalendarId),
      ).rejects.toThrow('Calendar or event not found on Google.');
    });
  });

  describe('listEvents', () => {
    it('should list events in calendar', async () => {
      const mockEvents = [
        {
          id: 'event1',
          summary: 'Meeting',
          description: 'Team meeting',
          start: { dateTime: '2026-01-03T10:00:00Z' },
          end: { dateTime: '2026-01-03T11:00:00Z' },
          status: 'confirmed',
          colorId: '1',
          extendedProperties: { private: { axis_task_id: 'task1' } },
        },
      ];

      mockCalendar.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const timeMin = new Date('2026-01-01');
      const timeMax = new Date('2026-01-31');

      const result = await service.listEvents(
        mockUserId,
        mockCalendarId,
        timeMin,
        timeMax,
      );

      expect(mockCalendar.events.list).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Meeting');
    });

    it('should list events without time range', async () => {
      mockCalendar.events.list.mockResolvedValue({
        data: { items: [] },
      });

      const result = await service.listEvents(mockUserId, mockCalendarId);

      expect(mockCalendar.events.list).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
        timeMin: undefined,
        timeMax: undefined,
        singleEvents: true,
        orderBy: 'startTime',
      });
      expect(result).toEqual([]);
    });
  });

  describe('createEvent', () => {
    it('should create event with all properties', async () => {
      const eventData: EventData = {
        title: 'New Task',
        description: 'Task description',
        startDateTime: new Date('2026-01-03T10:00:00Z'),
        endDateTime: new Date('2026-01-03T11:00:00Z'),
        colorId: '5',
        extendedProperties: {
          axis_task_id: 'task123',
          axis_project_id: 'proj123',
        },
      };

      mockCalendar.events.insert.mockResolvedValue({
        data: {
          id: 'newevent123',
          summary: 'New Task',
          description: 'Task description',
          start: { dateTime: '2026-01-03T10:00:00Z' },
          end: { dateTime: '2026-01-03T11:00:00Z' },
          status: 'confirmed',
          colorId: '5',
          extendedProperties: {
            private: {
              axis_task_id: 'task123',
              axis_project_id: 'proj123',
            },
          },
        },
      });

      const result = await service.createEvent(
        mockUserId,
        mockCalendarId,
        eventData,
      );

      expect(mockCalendar.events.insert).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
        requestBody: expect.objectContaining({
          summary: 'New Task',
          description: 'Task description',
          colorId: '5',
          extendedProperties: {
            private: {
              axis_task_id: 'task123',
              axis_project_id: 'proj123',
            },
          },
        }),
      });
      expect(result.id).toBe('newevent123');
    });

    it('should create event without optional properties', async () => {
      const eventData: EventData = {
        title: 'Simple Task',
        startDateTime: new Date('2026-01-03T10:00:00Z'),
        endDateTime: new Date('2026-01-03T11:00:00Z'),
      };

      mockCalendar.events.insert.mockResolvedValue({
        data: {
          id: 'newevent123',
          summary: 'Simple Task',
          start: { dateTime: '2026-01-03T10:00:00Z' },
          end: { dateTime: '2026-01-03T11:00:00Z' },
        },
      });

      const result = await service.createEvent(
        mockUserId,
        mockCalendarId,
        eventData,
      );

      expect(result.summary).toBe('Simple Task');
    });
  });

  describe('updateEvent', () => {
    it('should update event', async () => {
      const eventData: EventData = {
        title: 'Updated Task',
        description: 'Updated description',
        startDateTime: new Date('2026-01-03T14:00:00Z'),
        endDateTime: new Date('2026-01-03T15:00:00Z'),
      };

      mockCalendar.events.update.mockResolvedValue({
        data: {
          id: mockEventId,
          summary: 'Updated Task',
          description: 'Updated description',
          start: { dateTime: '2026-01-03T14:00:00Z' },
          end: { dateTime: '2026-01-03T15:00:00Z' },
        },
      });

      const result = await service.updateEvent(
        mockUserId,
        mockCalendarId,
        mockEventId,
        eventData,
      );

      expect(mockCalendar.events.update).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
        eventId: mockEventId,
        requestBody: expect.objectContaining({
          summary: 'Updated Task',
          description: 'Updated description',
        }),
      });
      expect(result.summary).toBe('Updated Task');
    });
  });

  describe('deleteEvent', () => {
    it('should delete event', async () => {
      mockCalendar.events.delete.mockResolvedValue({});

      await service.deleteEvent(mockUserId, mockCalendarId, mockEventId);

      expect(mockCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
        eventId: mockEventId,
      });
    });
  });

  describe('getEvent', () => {
    it('should get event by id', async () => {
      mockCalendar.events.get.mockResolvedValue({
        data: {
          id: mockEventId,
          summary: 'Test Event',
          start: { dateTime: '2026-01-03T10:00:00Z' },
          end: { dateTime: '2026-01-03T11:00:00Z' },
        },
      });

      const result = await service.getEvent(
        mockUserId,
        mockCalendarId,
        mockEventId,
      );

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Test Event');
    });

    it('should return null when event not found (404)', async () => {
      mockCalendar.events.get.mockRejectedValue({
        response: { status: 404 },
        message: 'Not found',
      });

      const result = await service.getEvent(
        mockUserId,
        mockCalendarId,
        mockEventId,
      );

      expect(result).toBeNull();
    });
  });

  describe('findCalendarByName', () => {
    it('should find calendar by name', async () => {
      mockCalendar.calendarList.list.mockResolvedValue({
        data: {
          items: [
            { id: 'cal1', summary: 'Work' },
            { id: 'cal2', summary: 'Axis' },
          ],
        },
      });

      const result = await service.findCalendarByName(mockUserId, 'Axis');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('cal2');
    });

    it('should return null when calendar not found', async () => {
      mockCalendar.calendarList.list.mockResolvedValue({
        data: {
          items: [{ id: 'cal1', summary: 'Work' }],
        },
      });

      const result = await service.findCalendarByName(
        mockUserId,
        'Nonexistent',
      );

      expect(result).toBeNull();
    });
  });

  describe('watchCalendar', () => {
    it('should set up webhook watch for calendar', async () => {
      const mockExpiration = Date.now() + 7 * 24 * 60 * 60 * 1000;
      mockCalendar.events.watch.mockResolvedValue({
        data: {
          resourceId: 'resource123',
          expiration: String(mockExpiration),
        },
      });

      const result = await service.watchCalendar(
        mockUserId,
        mockCalendarId,
        'https://example.com/webhook',
      );

      expect(mockCalendar.events.watch).toHaveBeenCalledWith({
        calendarId: mockCalendarId,
        requestBody: {
          id: expect.stringContaining('channel-'),
          type: 'web_hook',
          address: 'https://example.com/webhook',
        },
      });
      expect(result.channelId).toContain('channel-');
      expect(result.resourceId).toBe('resource123');
      expect(result.expiration).toBeInstanceOf(Date);
    });

    it('should sanitize calendar id in channel id', async () => {
      mockCalendar.events.watch.mockResolvedValue({
        data: {
          resourceId: 'resource123',
          expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await service.watchCalendar(
        mockUserId,
        'user@example.com',
        'https://example.com/webhook',
      );

      expect(mockCalendar.events.watch).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            id: expect.stringMatching(/channel-user_example_com-\d+/),
          }),
        }),
      );
    });
  });

  describe('stopWatch', () => {
    it('should stop watching channel', async () => {
      mockCalendar.channels.stop.mockResolvedValue({});

      await service.stopWatch(mockUserId, 'channel123', 'resource123');

      expect(mockCalendar.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: 'channel123',
          resourceId: 'resource123',
        },
      });
    });

    it('should not throw on stop watch failure', async () => {
      mockCalendar.channels.stop.mockRejectedValue(new Error('Stop failed'));

      // Should not throw
      await expect(
        service.stopWatch(mockUserId, 'channel123', 'resource123'),
      ).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw on 403 permission error', async () => {
      mockCalendar.calendarList.list.mockRejectedValue({
        response: {
          status: 403,
          data: { error: { message: 'Access denied' } },
        },
        message: 'Access denied',
      });

      await expect(service.listCalendars(mockUserId)).rejects.toThrow(
        /Insufficient permissions/,
      );
    });

    it('should throw on 429 rate limit error', async () => {
      mockCalendar.calendarList.list.mockRejectedValue({
        response: { status: 429 },
        message: 'Rate limit exceeded',
      });

      await expect(service.listCalendars(mockUserId)).rejects.toThrow(
        /Too many requests/,
      );
    });

    it('should throw generic error for unknown errors', async () => {
      mockCalendar.calendarList.list.mockRejectedValue({
        response: { status: 500 },
        message: 'Internal server error',
      });

      await expect(service.listCalendars(mockUserId)).rejects.toThrow(
        /Google Calendar API error/,
      );
    });
  });
});
