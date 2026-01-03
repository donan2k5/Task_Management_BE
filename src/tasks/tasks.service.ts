import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SyncService } from '../sync/sync.service';

/**
 * Tasks Service
 *
 * Manages tasks stored locally in MongoDB.
 * Tasks are auto-synced to Google Calendar when user has sync enabled.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
  ) {}

  /**
   * API TRỌNG TÂM: Lấy task cho Calendar theo khoảng thời gian tùy chỉnh
   */
  async findTasksInInterval(
    userId: string,
    start: string,
    end: string,
  ): Promise<Task[]> {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date format');
    }

    return this.taskModel
      .find({
        userId,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ date: 1 })
      .lean();
  }

  /**
   * Dashboard: Chỉ lấy task Cần làm ngay (Hôm nay hoặc Urgent & Important)
   */
  async findDashboardTasks(userId: string): Promise<Task[]> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    return this.taskModel
      .find({
        userId,
        status: { $ne: 'done' },
        date: { $gte: startOfToday, $lte: endOfToday },
      })
      .sort({ isImportant: -1, createdAt: -1 })
      .lean();
  }

  async findOverdueTasks(userId: string): Promise<Task[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    return this.taskModel
      .find({
        userId,
        status: { $ne: 'done' },
        date: { $lt: now },
      })
      .sort({ date: 1 })
      .lean();
  }

  async findCompletedTasksInDateRange(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<Task[]> {
    return this.taskModel
      .find({
        userId,
        status: 'done',
        updatedAt: { $gte: start, $lte: end },
      })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async findByProject(userId: string, projectId: string): Promise<Task[]> {
    return this.taskModel
      .find({
        userId,
        $or: [
          { project: projectId },
          { project: { $regex: new RegExp(projectId, 'i') } },
        ],
      })
      .sort({ deadline: 1, createdAt: -1 })
      .lean();
  }

  // --- CÁC HÀM CRUD CƠ BẢN ---

  async create(userId: string, createTaskDto: CreateTaskDto): Promise<Task> {
    const createdTask = new this.taskModel({
      ...createTaskDto,
      userId,
    });
    const savedTask = await createdTask.save();



    // Explicit Sync: Only sync if calendarId is provided
    if (createTaskDto.calendarId) {
      this.syncService
        .syncTaskToGoogle(userId, savedTask._id.toString(), createTaskDto.calendarId)
        .catch((err) =>
          this.logger.warn(`Explicit sync failed for new task: ${err.message}`),
        );
    }

    return savedTask;
  }

  async findAll(userId: string, status?: string): Promise<Task[]> {
    const filter: any = { userId };
    if (status === 'done') filter.status = 'done';
    else if (status === 'active') filter.status = { $ne: 'done' };

    return this.taskModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(userId: string, id: string): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);

    // Verify ownership
    if (task.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }

    return task;
  }

  async update(
    userId: string,
    id: string,
    updateTaskDto: UpdateTaskDto,
  ): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);

    // Verify ownership
    if (task.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(id, updateTaskDto, { new: true })
      .exec();

    // Check if task is mapped and sync if so
    this.syncService.syncTaskToGoogle(userId, id).catch((err) =>
      this.logger.warn(`Sync failed for updated task: ${err.message}`),
    );

    return updatedTask!;
  }

  async remove(userId: string, id: string): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);

    // Verify ownership
    if (task.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }

    // Auto-delete from Google Calendar (non-blocking)
    this.syncService.autoDeleteTaskFromGoogle(task).catch((err) =>
      this.logger.warn(`Auto-delete from Google failed: ${err.message}`),
    );

    const deletedTask = await this.taskModel.findByIdAndDelete(id).exec();
    return deletedTask!;
  }

  async findAllUnscheduled(userId: string) {
    return this.taskModel
      .find({
        userId,
        date: { $exists: false },
        status: { $ne: 'done' },
      })
      .sort({ isUrgent: -1, isImportant: -1 })
      .lean();
  }

  // Internal method for sync service (no userId check - trusts caller)
  async findByIdInternal(id: string): Promise<TaskDocument | null> {
    return this.taskModel.findById(id).exec();
  }

  // Internal method for sync service
  async findByGoogleEventId(
    googleEventId: string,
  ): Promise<TaskDocument | null> {
    return this.taskModel.findOne({ googleEventId }).exec();
  }
}
