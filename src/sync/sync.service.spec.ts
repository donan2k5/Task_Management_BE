import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import mongoose from 'mongoose';
import { SyncService } from './sync.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { AuthService } from '../auth/auth.service';
import { Project } from '../projects/schemas/project.schema';
import { Task } from '../tasks/schemas/task.schema';
import { User } from '../users/user.schema';

describe('SyncService', () => {
  let service: SyncService;
  let mockProjectModel: any;
  let mockTaskModel: any;
  let mockUserModel: any;
  let mockGoogleCalendarService: any;
  let mockAuthService: any;
  let mockConfigService: any;

  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockTaskId = new mongoose.Types.ObjectId().toString();
  const mockCalendarId = 'calendar123@group.calendar.google.com';

  const mockUser = {
    _id: mockUserId,
    email: 'test@example.com',
    googleAccessToken: 'access-token',
    dedicatedCalendarId: mockCalendarId,
    autoSyncEnabled: true,
    webhookChannelId: 'channel123',
    webhookResourceId: 'resource123',
    save: jest.fn().mockResolvedValue(true),
  };

  const mockTask = {
    _id: mockTaskId,
    userId: new mongoose.Types.ObjectId(mockUserId),
    title: 'Test Task',
    description: 'Test Description',
    date: new Date('2026-01-03T10:00:00Z'),
    time: '10:00',
    status: 'todo',
    project: 'Work',
    googleEventId: null,
    save: jest.fn().mockResolvedValue(true),
  };

  const mockProject = {
    _id: new mongoose.Types.ObjectId().toString(),
    userId: new mongoose.Types.ObjectId(mockUserId),
    name: 'Work',
    color: '#4285f4',
  };

  beforeEach(async () => {
    mockProjectModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };

    mockTaskModel = {
      findById: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockUserModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn().mockReturnThis(),
    };

    mockGoogleCalendarService = {
      listCalendars: jest.fn().mockResolvedValue([]),
      findCalendarByName: jest.fn().mockResolvedValue(null),
      createCalendar: jest
        .fn()
        .mockResolvedValue({ id: mockCalendarId, name: 'Axis' }),
      deleteCalendar: jest.fn().mockResolvedValue(undefined),
      listEvents: jest.fn().mockResolvedValue([]),
      createEvent: jest.fn().mockResolvedValue({
        id: 'event123',
        summary: 'Test Task',
      }),
      updateEvent: jest.fn().mockResolvedValue({
        id: 'event123',
        summary: 'Test Task Updated',
      }),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      getEvent: jest.fn().mockResolvedValue(null),
      watchCalendar: jest.fn().mockResolvedValue({
        channelId: 'channel123',
        resourceId: 'resource123',
        expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
      stopWatch: jest.fn().mockResolvedValue(undefined),
    };

    mockAuthService = {
      hasValidGoogleAuth: jest.fn().mockResolvedValue(true),
      getGoogleAccessToken: jest.fn().mockResolvedValue('access-token'),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          WEBHOOK_BASE_URL: 'https://example.com',
          APP_CALENDAR_NAME: 'Axis',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: getModelToken(Project.name),
          useValue: mockProjectModel,
        },
        {
          provide: getModelToken(Task.name),
          useValue: mockTaskModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: GoogleCalendarService,
          useValue: mockGoogleCalendarService,
        },
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

    service = module.get<SyncService>(SyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeDedicatedCalendar', () => {
    it('should create new calendar if none exists', async () => {
      const userWithCalendar = {
        ...mockUser,
        dedicatedCalendarId: mockCalendarId,
        autoSyncEnabled: true,
        save: jest.fn().mockResolvedValue(true),
      };
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      mockUserModel.findById
        .mockResolvedValueOnce({ ...mockUser, dedicatedCalendarId: null, autoSyncEnabled: false })
        .mockResolvedValue(userWithCalendar);
      mockUserModel.findOneAndUpdate.mockResolvedValue(userWithCalendar);
      mockGoogleCalendarService.findCalendarByName.mockResolvedValue(null);
      mockProjectModel.findOne.mockResolvedValue(null);
      mockProjectModel.create.mockResolvedValue({ name: 'Inbox' });
      mockTaskModel.find.mockResolvedValue([]);

      const result = await service.initializeDedicatedCalendar(mockUserId);

      expect(mockGoogleCalendarService.createCalendar).toHaveBeenCalledWith(
        mockUserId,
        'Axis',
        'Tasks and events from your Time Management app',
      );
      expect(result.dedicatedCalendarId).toBe(mockCalendarId);
    });

    it('should use existing calendar if found by name', async () => {
      const userWithCalendar = {
        ...mockUser,
        dedicatedCalendarId: 'existing-cal-id',
        autoSyncEnabled: true,
        save: jest.fn().mockResolvedValue(true),
      };
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      mockUserModel.findById
        .mockResolvedValueOnce({ ...mockUser, dedicatedCalendarId: null })
        .mockResolvedValue(userWithCalendar);
      mockUserModel.findOneAndUpdate.mockResolvedValue(userWithCalendar);
      mockGoogleCalendarService.findCalendarByName.mockResolvedValue({
        id: 'existing-cal-id',
        name: 'Axis',
      });
      mockProjectModel.findOne.mockResolvedValue({ name: 'Inbox' });
      mockTaskModel.find.mockResolvedValue([]);

      await service.initializeDedicatedCalendar(mockUserId);

      expect(mockGoogleCalendarService.createCalendar).not.toHaveBeenCalled();
    });

    it('should skip if already initialized', async () => {
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.initializeDedicatedCalendar(mockUserId);

      expect(mockGoogleCalendarService.createCalendar).not.toHaveBeenCalled();
      expect(result.autoSyncEnabled).toBe(true);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      mockUserModel.findById.mockResolvedValue(null);

      await expect(
        service.initializeDedicatedCalendar(mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOrCreateInboxProject', () => {
    it('should return existing inbox project', async () => {
      const inboxProject = { name: 'Inbox', userId: mockUserId };
      mockProjectModel.findOne.mockResolvedValue(inboxProject);

      const result = await service.getOrCreateInboxProject(mockUserId);

      expect(result).toEqual(inboxProject);
      expect(mockProjectModel.create).not.toHaveBeenCalled();
    });

    it('should create inbox project if not exists', async () => {
      mockProjectModel.findOne.mockResolvedValue(null);
      mockProjectModel.create.mockResolvedValue({
        name: 'Inbox',
        description: 'Default project for tasks synced from Google Calendar',
        status: 'active',
        color: '#808080',
      });

      const result = await service.getOrCreateInboxProject(mockUserId);

      expect(mockProjectModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Inbox',
          status: 'active',
        }),
      );
      expect(result.name).toBe('Inbox');
    });
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.getUserById(mockUserId);

      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      const result = await service.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllConnectedUsers', () => {
    it('should return all connected users', async () => {
      const connectedUsers = [mockUser, { ...mockUser, _id: 'user2' }];
      mockUserModel.find.mockResolvedValue(connectedUsers);

      const result = await service.getAllConnectedUsers();

      expect(mockUserModel.find).toHaveBeenCalledWith({
        autoSyncEnabled: true,
        dedicatedCalendarId: { $exists: true, $ne: null },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('getUserByWebhookChannel', () => {
    it('should return user by webhook channel id', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserByWebhookChannel('channel123');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        webhookChannelId: 'channel123',
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('syncTaskToGoogle', () => {
    beforeEach(() => {
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      mockUserModel.findById.mockResolvedValue(mockUser);
    });

    it('should create new event for task without googleEventId', async () => {
      const task = { ...mockTask, googleEventId: null, save: jest.fn() };
      mockTaskModel.findById.mockResolvedValue(task);
      mockProjectModel.findOne.mockResolvedValue(mockProject);
      mockGoogleCalendarService.createEvent.mockResolvedValue({
        id: 'newevent123',
        summary: 'Test Task',
      });

      const result = await service.syncTaskToGoogle(mockUserId, mockTaskId);

      expect(mockGoogleCalendarService.createEvent).toHaveBeenCalled();
      expect(task.googleEventId).toBe('newevent123');
      expect(task.save).toHaveBeenCalled();
    });

    it('should update existing event for task with googleEventId', async () => {
      const task = {
        ...mockTask,
        googleEventId: 'existingevent123',
        save: jest.fn(),
      };
      mockTaskModel.findById.mockResolvedValue(task);
      mockProjectModel.findOne.mockResolvedValue(mockProject);
      mockGoogleCalendarService.getEvent.mockResolvedValue({
        id: 'existingevent123',
      });
      mockGoogleCalendarService.updateEvent.mockResolvedValue({
        id: 'existingevent123',
        summary: 'Updated Task',
      });

      const result = await service.syncTaskToGoogle(mockUserId, mockTaskId);

      expect(mockGoogleCalendarService.updateEvent).toHaveBeenCalled();
      expect(task.save).toHaveBeenCalled();
    });

    it('should create new event if existing event not found on Google', async () => {
      const task = {
        ...mockTask,
        googleEventId: 'deletedevent',
        save: jest.fn(),
      };
      mockTaskModel.findById.mockResolvedValue(task);
      mockProjectModel.findOne.mockResolvedValue(null);
      mockGoogleCalendarService.getEvent.mockResolvedValue(null);
      mockGoogleCalendarService.createEvent.mockResolvedValue({
        id: 'newevent123',
      });

      await service.syncTaskToGoogle(mockUserId, mockTaskId);

      expect(mockGoogleCalendarService.createEvent).toHaveBeenCalled();
      expect(task.googleEventId).toBe('newevent123');
    });

    it('should throw NotFoundException if task not found', async () => {
      mockTaskModel.findById.mockResolvedValue(null);

      await expect(
        service.syncTaskToGoogle(mockUserId, mockTaskId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if task has no date', async () => {
      mockTaskModel.findById.mockResolvedValue({ ...mockTask, date: null });

      await expect(
        service.syncTaskToGoogle(mockUserId, mockTaskId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user has no dedicated calendar', async () => {
      mockUserModel.findById.mockResolvedValue({
        ...mockUser,
        dedicatedCalendarId: null,
      });
      mockTaskModel.findById.mockResolvedValue(mockTask);

      await expect(
        service.syncTaskToGoogle(mockUserId, mockTaskId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('autoSyncTaskToGoogle', () => {
    it('should sync task when user has auto-sync enabled', async () => {
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      mockProjectModel.findOne.mockResolvedValue(mockProject);
      mockGoogleCalendarService.createEvent.mockResolvedValue({
        id: 'event123',
      });

      await service.autoSyncTaskToGoogle(mockTaskId);

      expect(mockGoogleCalendarService.createEvent).toHaveBeenCalled();
    });

    it('should skip if task not found', async () => {
      mockTaskModel.findById.mockResolvedValue(null);

      await service.autoSyncTaskToGoogle(mockTaskId);

      expect(mockGoogleCalendarService.createEvent).not.toHaveBeenCalled();
    });

    it('should skip if task has no date', async () => {
      mockTaskModel.findById.mockResolvedValue({ ...mockTask, date: null });

      await service.autoSyncTaskToGoogle(mockTaskId);

      expect(mockUserModel.findById).not.toHaveBeenCalled();
    });

    it('should skip if user has auto-sync disabled', async () => {
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockUserModel.findById.mockResolvedValue({
        ...mockUser,
        autoSyncEnabled: false,
      });

      await service.autoSyncTaskToGoogle(mockTaskId);

      expect(mockGoogleCalendarService.createEvent).not.toHaveBeenCalled();
    });

    it('should skip if user has no valid Google auth', async () => {
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(false);

      await service.autoSyncTaskToGoogle(mockTaskId);

      expect(mockGoogleCalendarService.createEvent).not.toHaveBeenCalled();
    });

    it('should not throw on error, only log', async () => {
      mockTaskModel.findById.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(
        service.autoSyncTaskToGoogle(mockTaskId),
      ).resolves.not.toThrow();
    });
  });

  describe('autoDeleteTaskFromGoogle', () => {
    const taskWithGoogleEvent = {
      ...mockTask,
      googleEventId: 'event123',
    };

    it('should delete event from Google', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);

      await service.autoDeleteTaskFromGoogle(taskWithGoogleEvent as any);

      expect(mockGoogleCalendarService.deleteEvent).toHaveBeenCalledWith(
        mockUserId,
        mockCalendarId,
        'event123',
      );
    });

    it('should skip if task has no googleEventId', async () => {
      await service.autoDeleteTaskFromGoogle({ ...mockTask, googleEventId: null } as any);

      expect(mockGoogleCalendarService.deleteEvent).not.toHaveBeenCalled();
    });

    it('should skip if task has no userId', async () => {
      await service.autoDeleteTaskFromGoogle({
        ...taskWithGoogleEvent,
        userId: null,
      } as any);

      expect(mockGoogleCalendarService.deleteEvent).not.toHaveBeenCalled();
    });

    it('should skip if user has no dedicated calendar', async () => {
      mockUserModel.findById.mockResolvedValue({
        ...mockUser,
        dedicatedCalendarId: null,
      });

      await service.autoDeleteTaskFromGoogle(taskWithGoogleEvent as any);

      expect(mockGoogleCalendarService.deleteEvent).not.toHaveBeenCalled();
    });

    it('should skip if user has auto-sync disabled', async () => {
      mockUserModel.findById.mockResolvedValue({
        ...mockUser,
        autoSyncEnabled: false,
      });

      await service.autoDeleteTaskFromGoogle(taskWithGoogleEvent as any);

      expect(mockGoogleCalendarService.deleteEvent).not.toHaveBeenCalled();
    });

    it('should not throw on error, only log', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      mockGoogleCalendarService.deleteEvent.mockRejectedValue(
        new Error('Delete failed'),
      );

      await expect(
        service.autoDeleteTaskFromGoogle(taskWithGoogleEvent as any),
      ).resolves.not.toThrow();
    });
  });

  describe('syncAllTasksToGoogle', () => {
    beforeEach(() => {
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
    });

    it('should sync all scheduled tasks', async () => {
      const tasks = [
        { ...mockTask, _id: { toString: () => 'task1' }, title: 'Task 1', save: jest.fn() },
        { ...mockTask, _id: { toString: () => 'task2' }, title: 'Task 2', save: jest.fn() },
      ];
      // First call for validateGoogleAuth, then for each syncTaskToGoogle
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockTaskModel.find.mockResolvedValue(tasks);
      mockTaskModel.findById
        .mockResolvedValueOnce(tasks[0])
        .mockResolvedValueOnce(tasks[1]);
      mockProjectModel.findOne.mockResolvedValue(mockProject);
      mockGoogleCalendarService.createEvent.mockResolvedValue({ id: 'event' });

      const result = await service.syncAllTasksToGoogle(mockUserId);

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should handle partial failures', async () => {
      const tasks = [
        { ...mockTask, _id: { toString: () => 'task1' }, title: 'Task 1', save: jest.fn() },
        { ...mockTask, _id: { toString: () => 'task2' }, title: 'Task 2', save: jest.fn() },
      ];
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockTaskModel.find.mockResolvedValue(tasks);
      mockTaskModel.findById
        .mockResolvedValueOnce(tasks[0])
        .mockResolvedValueOnce(tasks[1]);
      mockProjectModel.findOne.mockResolvedValue(null);
      mockGoogleCalendarService.createEvent
        .mockResolvedValueOnce({ id: 'event1' })
        .mockRejectedValueOnce(new Error('API error'));

      const result = await service.syncAllTasksToGoogle(mockUserId);

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should return empty result if no tasks to sync', async () => {
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockTaskModel.find.mockResolvedValue([]);

      const result = await service.syncAllTasksToGoogle(mockUserId);

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('getGoogleCalendars', () => {
    it('should return list of calendars', async () => {
      mockAuthService.hasValidGoogleAuth.mockResolvedValue(true);
      const calendars = [
        { id: 'cal1', name: 'Primary' },
        { id: 'cal2', name: 'Work' },
      ];
      mockGoogleCalendarService.listCalendars.mockResolvedValue(calendars);

      const result = await service.getGoogleCalendars(mockUserId);

      expect(result).toEqual(calendars);
    });
  });

  describe('disconnectSync', () => {
    it('should disconnect sync and cleanup', async () => {
      const userWithSave = { ...mockUser, save: jest.fn().mockResolvedValue(true) };
      mockUserModel.findById.mockResolvedValue(userWithSave);
      mockTaskModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 5 });

      await service.disconnectSync(mockUserId);

      expect(mockGoogleCalendarService.stopWatch).toHaveBeenCalledWith(
        mockUserId,
        'channel123',
        'resource123',
      );
      expect(userWithSave.save).toHaveBeenCalled();
      expect(mockTaskModel.updateMany).toHaveBeenCalled();
    });

    it('should skip webhook cleanup if no webhook configured', async () => {
      const userWithSave = {
        ...mockUser,
        webhookChannelId: null,
        webhookResourceId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      mockUserModel.findById.mockResolvedValue(userWithSave);
      mockTaskModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });

      await service.disconnectSync(mockUserId);

      expect(mockGoogleCalendarService.stopWatch).not.toHaveBeenCalled();
      expect(userWithSave.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(service.disconnectSync(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
