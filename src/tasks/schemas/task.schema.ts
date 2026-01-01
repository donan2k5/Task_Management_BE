import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  project: string;

  @Prop({ type: Date })
  scheduledDate: Date; // Start date/time for the task (includes time component)

  @Prop({ type: Date })
  scheduledEndDate: Date; // End date/time for calendar event duration

  @Prop({ type: Date })
  deadline: Date; // Actual due date set by user - independent of calendar event duration

  @Prop({ default: false })
  isUrgent: boolean;

  @Prop({ default: false })
  isImportant: boolean;

  @Prop({ default: false })
  completed: boolean;

  @Prop({ default: 'backlog' })
  status: string;

  @Prop()
  description: string;

  // Google Calendar sync fields
  @Prop()
  googleEventId?: string; // ID of the event in Google Calendar

  /** @deprecated No longer used - all tasks sync to User's dedicated calendar */
  @Prop()
  googleCalendarId?: string;

  @Prop({ type: Date })
  lastSyncedAt?: Date; // Last time this task was synced with Google
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ userId: 1 });
TaskSchema.index({ userId: 1, scheduledDate: 1 });
TaskSchema.index({ userId: 1, project: 1 }); // For findByProject query
TaskSchema.index({ userId: 1, status: 1 }); // For dashboard queries
TaskSchema.index({ googleEventId: 1 });
TaskSchema.index({ project: 1, googleEventId: 1 });
TaskSchema.index({ scheduledDate: 1 });
