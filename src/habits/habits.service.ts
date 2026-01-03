import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { Habit, HabitDocument } from './schemas/habit.schema';
import { HabitLog, HabitLogDocument } from './schemas/habit-log.schema';
import { CreateHabitDto, UpdateHabitDto, LogHabitDto } from './dto/habit.dto';

export interface HabitWithStats {
  habit: Habit & { _id: string };
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  completionRate: number;
  thisWeekLogs: { date: string; completed: boolean }[];
}

@Injectable()
export class HabitsService {
  constructor(
    @InjectModel(Habit.name) private habitModel: Model<HabitDocument>,
    @InjectModel(HabitLog.name) private habitLogModel: Model<HabitLogDocument>,
  ) {}

  async create(userId: string, dto: CreateHabitDto): Promise<Habit> {
    const habit = new this.habitModel({
      ...dto,
      userId: new mongoose.Types.ObjectId(userId),
    });
    return habit.save();
  }

  async findAll(userId: string): Promise<HabitWithStats[]> {
    const habits = await this.habitModel
      .find({ userId: new mongoose.Types.ObjectId(userId), isActive: true })
      .lean();

    const habitsWithStats = await Promise.all(
      habits.map(async (habit) => {
        const stats = await this.getHabitStats(habit._id.toString(), userId);
        return {
          habit: { ...habit, _id: habit._id.toString() },
          ...stats,
        };
      }),
    );

    return habitsWithStats;
  }

  async findOne(userId: string, habitId: string): Promise<Habit> {
    const habit = await this.habitModel.findById(habitId);
    if (!habit) throw new NotFoundException('Habit not found');
    if (habit.userId.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return habit;
  }

  async update(
    userId: string,
    habitId: string,
    dto: UpdateHabitDto,
  ): Promise<Habit> {
    await this.findOne(userId, habitId);
    const updated = await this.habitModel.findByIdAndUpdate(habitId, dto, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Habit not found');
    return updated;
  }

  async remove(userId: string, habitId: string): Promise<void> {
    await this.findOne(userId, habitId);
    await this.habitModel.findByIdAndDelete(habitId);
    // Clean up logs
    await this.habitLogModel.deleteMany({
      habitId: new mongoose.Types.ObjectId(habitId),
    });
  }

  async logHabit(
    userId: string,
    habitId: string,
    dto: LogHabitDto,
  ): Promise<HabitLog> {
    await this.findOne(userId, habitId);

    const date = dto.date ? new Date(dto.date) : new Date();
    date.setHours(0, 0, 0, 0);

    const existingLog = await this.habitLogModel.findOne({
      habitId: new mongoose.Types.ObjectId(habitId),
      date,
    });

    if (existingLog) {
      existingLog.completed = dto.completed ?? !existingLog.completed;
      existingLog.note = dto.note ?? existingLog.note;
      return existingLog.save();
    }

    const log = new this.habitLogModel({
      habitId: new mongoose.Types.ObjectId(habitId),
      userId: new mongoose.Types.ObjectId(userId),
      date,
      completed: dto.completed ?? true,
      note: dto.note,
    });
    return log.save();
  }

  async getLogsForDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HabitLog[]> {
    return this.habitLogModel
      .find({
        userId: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate },
      })
      .lean();
  }

  private async getHabitStats(
    habitId: string,
    userId: string,
  ): Promise<Omit<HabitWithStats, 'habit'>> {
    const logs = await this.habitLogModel
      .find({
        habitId: new mongoose.Types.ObjectId(habitId),
        completed: true,
      })
      .sort({ date: -1 })
      .lean();

    // Current streak calculation
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sortedLogs = logs.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Check if today is completed - if not, start from yesterday
    const todayLog = sortedLogs.find(
      (log) => new Date(log.date).toDateString() === today.toDateString(),
    );

    const startDay = todayLog ? 0 : 1; // Start from today if completed, otherwise yesterday

    for (let i = startDay; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      checkDate.setHours(0, 0, 0, 0);

      const hasLog = sortedLogs.some(
        (log) => new Date(log.date).toDateString() === checkDate.toDateString(),
      );

      if (hasLog) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Longest streak calculation
    let longestStreak = 0;
    let tempStreak = 0;
    const allDates = sortedLogs.map((l) => new Date(l.date).toDateString());

    for (let i = 0; i < allDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prev = new Date(allDates[i - 1]);
        const curr = new Date(allDates[i]);
        const diffDays = Math.round(
          (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // This week logs - OPTIMIZED: Single query instead of 7 queries
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Batch fetch all logs for this week in a single query
    const weekLogs = await this.habitLogModel
      .find({
        habitId: new mongoose.Types.ObjectId(habitId),
        date: { $gte: weekStart, $lte: weekEnd },
      })
      .lean();

    // Build the thisWeekLogs array from the batch result
    const thisWeekLogs: { date: string; completed: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(weekStart);
      checkDate.setDate(checkDate.getDate() + i);

      const log = weekLogs.find(
        (l) => new Date(l.date).toDateString() === checkDate.toDateString(),
      );

      thisWeekLogs.push({
        date: checkDate.toISOString().split('T')[0],
        completed: log?.completed ?? false,
      });
    }

    // Completion rate (last 30 days)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentLogs = logs.filter((l) => new Date(l.date) >= thirtyDaysAgo);
    const completionRate = Math.round((recentLogs.length / 30) * 100);

    return {
      currentStreak,
      longestStreak,
      totalCompletions: logs.length,
      completionRate,
      thisWeekLogs,
    };
  }
}
