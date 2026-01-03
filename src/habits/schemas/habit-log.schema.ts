import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type HabitLogDocument = HabitLog & Document;

@Schema({ timestamps: true })
export class HabitLog {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Habit',
    required: true,
    index: true,
  })
  habitId: mongoose.Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ default: true })
  completed: boolean;

  @Prop()
  note?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HabitLogSchema = SchemaFactory.createForClass(HabitLog);

// Unique constraint: one log per habit per day
HabitLogSchema.index({ habitId: 1, date: 1 }, { unique: true });
HabitLogSchema.index({ userId: 1, date: 1 });
