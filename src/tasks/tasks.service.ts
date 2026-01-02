import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

/**
 * Tasks Service
 *
 * Manages tasks stored locally in MongoDB.
 * Tasks are NOT synced to external calendars - they stay within the app.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(@InjectModel(Task.name) private taskModel: Model<TaskDocument>) {}

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
        scheduledDate: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ scheduledDate: 1 })
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
        status: 'todo',
        $or: [
          { isUrgent: true, isImportant: true },
          {
            scheduledDate: { $gte: startOfToday, $lte: endOfToday },
          },
        ],
      })
      .sort({ isUrgent: -1, isImportant: -1, createdAt: -1 })
      .lean();
  }

  async findOverdueTasks(userId: string): Promise<Task[]> {
    const now = new Date();
    return this.taskModel
      .find({
        userId,
        status: { $ne: 'done' },
        $or: [
          { deadline: { $lt: now } },
          { scheduledDate: { $lt: now } },
        ],
      })
      .sort({ deadline: 1, scheduledDate: 1 })
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
    return createdTask.save();
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

    return updatedTask!;
  }

  async remove(userId: string, id: string): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);

    // Verify ownership
    if (task.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }

    const deletedTask = await this.taskModel.findByIdAndDelete(id).exec();
    return deletedTask!;
  }

  async findAllUnscheduled(userId: string) {
    return this.taskModel
      .find({
        userId,
        scheduledDate: { $exists: false },
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
