import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PomodoroSessionDocument = PomodoroSession & Document;

@Schema({ timestamps: true })
export class PomodoroSession {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Task', required: false })
  taskId?: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ required: true })
  duration: number; // in seconds

  @Prop({ required: true, enum: ['focus', 'shortBreak', 'longBreak'] })
  mode: string;

  @Prop()
  note?: string;
}

export const PomodoroSessionSchema =
  SchemaFactory.createForClass(PomodoroSession);
