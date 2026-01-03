import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  project: string;

  @Prop({ type: Date })
  date: Date; // The single source of truth for "Day"

  @Prop()
  time?: string; // Optional time (e.g. "14:30")

  @Prop({ type: Date })
  deadline: Date; // Actual due date set by user

  @Prop({ default: false })
  isUrgent: boolean;

  @Prop({ default: false })
  isImportant: boolean;

  @Prop({ default: false })
  completed: boolean;

  @Prop({ default: 'todo' })
  status: string;

  @Prop()
  description: string;

  // Google Calendar sync fields (used by sync.service for existing functionality)
  @Prop()
  googleEventId?: string;

  @Prop({ type: Date })
  lastSyncedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ userId: 1 });
TaskSchema.index({ userId: 1, date: 1 }); // For range queries
TaskSchema.index({ date: 1 });
