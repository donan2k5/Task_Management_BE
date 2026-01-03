import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type HabitDocument = Habit & Document;

@Schema({ timestamps: true })
export class Habit {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '📝' })
  icon: string;

  @Prop({ default: '#6366f1' })
  color: string;

  @Prop({ type: String, enum: ['daily', 'weekly'], default: 'daily' })
  frequency: 'daily' | 'weekly';

  @Prop({ type: [Number], default: [0, 1, 2, 3, 4, 5, 6] })
  targetDays: number[]; // 0=Sunday, 1=Monday, etc.

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  description?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HabitSchema = SchemaFactory.createForClass(Habit);

HabitSchema.index({ userId: 1 });
HabitSchema.index({ userId: 1, isActive: 1 });
