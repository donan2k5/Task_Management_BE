import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SyncService } from '../sync/sync.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @Inject(forwardRef(() => SyncService)) private syncService: SyncService,
  ) {}

  /**
   * API TRỌNG TÂM: Lấy task cho Calendar theo khoảng thời gian tùy chỉnh
   */
  async findTasksInInterval(start: string, end: string): Promise<Task[]> {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date format');
    }

    return this.taskModel
      .find({
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
  async findDashboardTasks(): Promise<Task[]> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    return this.taskModel
      .find({
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

  // --- CÁC HÀM CRUD CƠ BẢN ---

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const createdTask = new this.taskModel(createTaskDto);
    const savedTask = await createdTask.save();

    this.triggerAutoSync(savedTask._id.toString());

    return savedTask;
  }

  private triggerAutoSync(taskId: string): void {
    setImmediate(async () => {
      try {
        await this.syncService.autoSyncTaskToGoogle(taskId);
      } catch (error) {
        this.logger.error(`Auto-sync failed for task ${taskId}`, error);
      }
    });
  }

  async findAll(status?: string): Promise<Task[]> {
    const filter: any = {};
    if (status === 'done') filter.status = 'done';
    else if (status === 'active') filter.status = { $ne: 'done' };

    return this.taskModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const updatedTask = await this.taskModel
      .findByIdAndUpdate(id, updateTaskDto, { new: true })
      .exec();
    if (!updatedTask) throw new NotFoundException(`Task ${id} not found`);

    this.triggerAutoSync(id);

    return updatedTask;
  }

  async remove(id: string): Promise<Task> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);

    setImmediate(async () => {
      try {
        await this.syncService.autoDeleteTaskFromGoogle(task);
      } catch (error) {
        this.logger.error(`Auto-delete event failed for task ${id}`, error);
      }
    });

    const deletedTask = await this.taskModel.findByIdAndDelete(id).exec();
    return deletedTask!;
  }

  async findByProject(projectName: string): Promise<Task[]> {
    return this.taskModel.find({ project: projectName }).exec();
  }

  async findAllUnscheduled() {
    return this.taskModel
      .find({
        scheduledDate: { $exists: false },
        status: { $ne: 'done' },
      })
      .sort({ isUrgent: -1, isImportant: -1 })
      .lean();
  }
}
