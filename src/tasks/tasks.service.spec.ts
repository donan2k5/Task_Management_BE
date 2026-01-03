import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from './schemas/task.schema';
import { SyncService } from '../sync/sync.service';

describe('TasksService', () => {
  let service: TasksService;
  let mockTaskModel: any;
  let mockSyncService: any;

  const mockTask = {
    _id: 'task123',
    userId: 'user123',
    title: 'Test Task',
    description: 'Test Description',
    status: 'todo',
    isUrgent: true,
    isImportant: false,
    date: new Date('2026-01-03'),
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn().mockReturnThis(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      findOne: jest.fn(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockTask]),
      exec: jest.fn(),
      countDocuments: jest.fn(),
    };

    // Mock constructor for create
    const MockTaskModel = function (data: any) {
      return {
        ...data,
        save: jest.fn().mockResolvedValue({ ...data, _id: 'newtask123' }),
      };
    };
    Object.assign(MockTaskModel, mockTaskModel);

    mockSyncService = {
      autoSyncTaskToGoogle: jest.fn().mockResolvedValue(undefined),
      autoDeleteTaskFromGoogle: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getModelToken(Task.name),
          useValue: MockTaskModel,
        },
        {
          provide: SyncService,
          useValue: mockSyncService,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findTasksInInterval', () => {
    it('should find tasks within date range', async () => {
      const startDate = '2026-01-01';
      const endDate = '2026-01-07';

      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockTask]),
        }),
      });

      const result = await service.findTasksInInterval(
        'user123',
        startDate,
        endDate,
      );

      expect(mockTaskModel.find).toHaveBeenCalledWith({
        userId: 'user123',
        date: {
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        },
      });
      expect(result).toEqual([mockTask]);
    });

    it('should throw BadRequestException for invalid date format', async () => {
      await expect(
        service.findTasksInInterval('user123', 'invalid', '2026-01-07'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findDashboardTasks', () => {
    it('should find urgent/important tasks and today tasks', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockTask]),
        }),
      });

      const result = await service.findDashboardTasks('user123');

      expect(mockTaskModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          status: 'todo',
          $or: expect.any(Array),
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findOverdueTasks', () => {
    it('should find overdue tasks', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockTask]),
        }),
      });

      const result = await service.findOverdueTasks('user123');

      expect(mockTaskModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          status: { $ne: 'done' },
          date: { $lt: expect.any(Date) },
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findCompletedTasksInDateRange', () => {
    it('should find completed tasks in date range', async () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-07');

      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ ...mockTask, status: 'done' }]),
        }),
      });

      const result = await service.findCompletedTasksInDateRange(
        'user123',
        start,
        end,
      );

      expect(mockTaskModel.find).toHaveBeenCalledWith({
        userId: 'user123',
        status: 'done',
        updatedAt: { $gte: start, $lte: end },
      });
      expect(result).toBeDefined();
    });
  });

  describe('findByProject', () => {
    it('should find tasks by project', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockTask]),
        }),
      });

      const result = await service.findByProject('user123', 'proj123');

      expect(mockTaskModel.find).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new task', async () => {
      const createDto = {
        title: 'New Task',
        description: 'New Description',
        isUrgent: false,
        isImportant: true,
      };

      const result = await service.create('user123', createDto);

      expect(result).toHaveProperty('_id');
      expect(result.title).toBe('New Task');
    });
  });

  describe('findAll', () => {
    it('should find all tasks for user', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockTask]),
        }),
      });

      const result = await service.findAll('user123');

      expect(mockTaskModel.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(result).toEqual([mockTask]);
    });

    it('should filter by done status', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await service.findAll('user123', 'done');

      expect(mockTaskModel.find).toHaveBeenCalledWith({
        userId: 'user123',
        status: 'done',
      });
    });

    it('should filter by active status', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockTask]),
        }),
      });

      await service.findAll('user123', 'active');

      expect(mockTaskModel.find).toHaveBeenCalledWith({
        userId: 'user123',
        status: { $ne: 'done' },
      });
    });
  });

  describe('findOne', () => {
    it('should find task by id', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          userId: { toString: () => 'user123' },
        }),
      });

      const result = await service.findOne('user123', 'task123');

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if task not found', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('user123', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own task', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          userId: { toString: () => 'otheruser' },
        }),
      });

      await expect(service.findOne('user123', 'task123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should update task', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          userId: { toString: () => 'user123' },
        }),
      });
      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          title: 'Updated Title',
        }),
      });

      const result = await service.update('user123', 'task123', {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('should throw NotFoundException if task not found', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('user123', 'nonexistent', { title: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own task', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          userId: { toString: () => 'otheruser' },
        }),
      });

      await expect(
        service.update('user123', 'task123', { title: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete task', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          userId: { toString: () => 'user123' },
        }),
      });
      mockTaskModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const result = await service.remove('user123', 'task123');

      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException if task not found', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.remove('user123', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllUnscheduled', () => {
    it('should find unscheduled tasks', async () => {
      mockTaskModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockTask]),
        }),
      });

      const result = await service.findAllUnscheduled('user123');

      expect(mockTaskModel.find).toHaveBeenCalledWith({
        userId: 'user123',
        date: { $exists: false },
        status: { $ne: 'done' },
      });
      expect(result).toBeDefined();
    });
  });

  describe('Internal Methods', () => {
    describe('findByIdInternal', () => {
      it('should find task by id without user check', async () => {
        mockTaskModel.findById.mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockTask),
        });

        const result = await service.findByIdInternal('task123');

        expect(result).toEqual(mockTask);
      });
    });

    describe('findByGoogleEventId', () => {
      it('should find task by google event id', async () => {
        mockTaskModel.findOne.mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockTask),
        });

        const result = await service.findByGoogleEventId('googleEvent123');

        expect(mockTaskModel.findOne).toHaveBeenCalledWith({
          googleEventId: 'googleEvent123',
        });
        expect(result).toEqual(mockTask);
      });
    });
  });
});
