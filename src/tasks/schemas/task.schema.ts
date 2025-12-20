import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true })
  title: string;

  @Prop()
  project: string;

  @Prop({ type: Date })
  scheduledDate: Date; // Ngày bắt đầu làm

  @Prop()
  scheduledTime: string;

  @Prop({ type: Date })
  deadline: Date;

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
}

export const TaskSchema = SchemaFactory.createForClass(Task);
