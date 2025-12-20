import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private taskModel: Model<TaskDocument>) {}

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
      .sort({ scheduledDate: 1, scheduledTime: 1 }) // Sắp xếp thời gian thực tế
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
    return createdTask.save();
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
    return updatedTask;
  }

  async remove(id: string): Promise<Task> {
    const deletedTask = await this.taskModel.findByIdAndDelete(id).exec();
    if (!deletedTask) throw new NotFoundException(`Task ${id} not found`);
    return deletedTask;
  }

  async findByProject(projectName: string): Promise<Task[]> {
    return this.taskModel.find({ project: projectName }).exec();
  }

  async findAllUnscheduled() {
    return this.taskModel
      .find({
        scheduledTime: { $exists: false },
        status: { $ne: 'done' },
      })
      .sort({ isUrgent: -1, isImportant: -1 })
      .lean();
  }
}
