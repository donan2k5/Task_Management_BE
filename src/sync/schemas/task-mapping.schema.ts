import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type TaskMappingDocument = TaskMapping & Document;

@Schema({ timestamps: true, collection: 'task_mappings' })
export class TaskMapping {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
  })
  taskId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ required: true, enum: ['google', 'microsoft', 'github'] })
  provider: string;

  @Prop({ required: true })
  externalEventId: string;

  @Prop({ required: true })
  externalCalendarId: string; // Matches ConnectedCalendar.externalId

  @Prop({ type: Date })
  lastSyncedAt: Date;

  @Prop()
  syncHash: string; // Checksum to detect changes

  @Prop({ type: Object })
  metadata?: Record<string, any>; // Provider-specific data (e.g. htmlLink, etag)
}

export const TaskMappingSchema = SchemaFactory.createForClass(TaskMapping);

TaskMappingSchema.index({ taskId: 1, provider: 1 }, { unique: true }); // One mapping per provider per task
TaskMappingSchema.index({ externalEventId: 1 });
TaskMappingSchema.index({ userId: 1 });
