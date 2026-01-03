import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CalendarEventDocument = CalendarEvent & Document;

@Schema({ timestamps: true, collection: 'calendar_events' })
export class CalendarEvent {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, default: 'google' })
  provider: 'google' | 'microsoft';

  @Prop({ required: true, index: true })
  externalId: string; // Google Event ID

  @Prop({ required: true, index: true })
  calendarId: string; // External calendar ID

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true, type: Date, index: true })
  start: Date;

  @Prop({ required: true, type: Date })
  end: Date;

  @Prop({ default: false })
  allDay: boolean;

  @Prop()
  location?: string;

  @Prop({ default: 'confirmed' })
  status: 'confirmed' | 'tentative' | 'cancelled';

  @Prop()
  color?: string;

  @Prop({ type: Date })
  lastSyncedAt: Date;
}

export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEvent);

// Compound index for efficient queries
CalendarEventSchema.index({ userId: 1, calendarId: 1, start: 1, end: 1 });
CalendarEventSchema.index({ userId: 1, externalId: 1 }, { unique: true });
