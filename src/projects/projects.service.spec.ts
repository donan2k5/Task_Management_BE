import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from './schemas/project.schema';
import { TasksService } from '../tasks/tasks.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let mockProjectModel: any;
  let mockTasksService: any;

  const mockProject = {
    _id: 'proj123',
    userId: 'user123',
    name: 'Test Project',
    description: 'Test Description',
    status: 'active',
    color: '#FF0000',
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    mockProjectModel = {
      find: jest.fn().mockReturnThis(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockProject]),
    };

    // Mock constructor for create
    const MockProjectModel = function (data: any) {
      return {
        ...data,
        save: jest.fn().mockResolvedValue({ ...data, _id: 'newproj123' }),
      };
    };
    Object.assign(MockProjectModel, mockProjectModel);

    mockTasksService = {
      findByProject: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getModelToken(Project.name),
          useValue: MockProjectModel,
        },
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new project', async () => {
      const createDto = {
        name: 'New Project',
        description: 'New Description',
        color: '#00FF00',
      };

      const result = await service.create('user123', createDto);

      expect(result).toHaveProperty('_id');
      expect(result.name).toBe('New Project');
    });
  });

  describe('findAll', () => {
    it('should find all projects with task stats', async () => {
      mockProjectModel.aggregate.mockResolvedValue([
        {
          ...mockProject,
          tasksCount: 5,
          progress: 40,
        },
      ]);

      const result = await service.findAll('user123');

      expect(mockProjectModel.aggregate).toHaveBeenCalled();
      expect(result[0]).toHaveProperty('tasksCount');
      expect(result[0]).toHaveProperty('progress');
    });
  });

  describe('findOne', () => {
    it('should find project by id', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          userId: { toString: () => 'user123' },
        }),
      });

      const result = await service.findOne('user123', 'proj123');

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if project not found', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('user123', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own project', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          userId: { toString: () => 'otheruser' },
        }),
      });

      await expect(service.findOne('user123', 'proj123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getTasks', () => {
    it('should get tasks for project', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          userId: { toString: () => 'user123' },
        }),
      });
      mockTasksService.findByProject.mockResolvedValue([
        { _id: 'task1', title: 'Task 1' },
      ]);

      const result = await service.getTasks('user123', 'proj123');

      expect(mockTasksService.findByProject).toHaveBeenCalledWith(
        'user123',
        'proj123',
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update project', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          userId: { toString: () => 'user123' },
        }),
      });
      mockProjectModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          name: 'Updated Name',
        }),
      });

      const result = await service.update('user123', 'proj123', {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException if project not found', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('user123', 'nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own project', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          userId: { toString: () => 'otheruser' },
        }),
      });

      await expect(
        service.update('user123', 'proj123', { name: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete project', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          userId: { toString: () => 'user123' },
        }),
      });
      mockProjectModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProject),
      });

      const result = await service.remove('user123', 'proj123');

      expect(result).toEqual(mockProject);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.remove('user123', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own project', async () => {
      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockProject,
          userId: { toString: () => 'otheruser' },
        }),
      });

      await expect(service.remove('user123', 'proj123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getStats', () => {
    it('should return project stats', async () => {
      mockProjectModel.countDocuments.mockResolvedValue(5);

      const result = await service.getStats('user123');

      expect(result).toEqual({ totalProjects: 5 });
    });
  });

  describe('findDashboardProjects', () => {
    it('should find active projects for dashboard', async () => {
      mockProjectModel.find.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProject]),
        }),
      });

      const result = await service.findDashboardProjects('user123');

      expect(mockProjectModel.find).toHaveBeenCalledWith({
        userId: 'user123',
        status: 'active',
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('Internal Methods', () => {
    describe('findByIdInternal', () => {
      it('should find project by id without user check', async () => {
        mockProjectModel.findById.mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockProject),
        });

        const result = await service.findByIdInternal('proj123');

        expect(result).toEqual(mockProject);
      });

      it('should return null if not found', async () => {
        mockProjectModel.findById.mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        });

        const result = await service.findByIdInternal('nonexistent');

        expect(result).toBeNull();
      });
    });
  });
});
