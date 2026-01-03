import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PomodoroSession,
  PomodoroSessionDocument,
} from './schemas/pomodoro-session.schema';

@Injectable()
export class PomodoroService {
  constructor(
    @InjectModel(PomodoroSession.name)
    private sessionModel: Model<PomodoroSessionDocument>,
  ) {}

  async create(
    createSessionDto: any,
    userId: string,
  ): Promise<PomodoroSession> {
    const newSession = new this.sessionModel({
      ...createSessionDto,
      userId,
    });
    return newSession.save();
  }

  async findAllByUser(userId: string): Promise<PomodoroSession[]> {
    return this.sessionModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .populate('taskId', 'title project') // optional: populate task details
      .exec();
  }
}
