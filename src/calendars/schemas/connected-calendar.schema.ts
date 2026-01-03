import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type ConnectedCalendarDocument = ConnectedCalendar & Document;

@Schema({ timestamps: true, collection: 'connected_calendars' })
export class ConnectedCalendar {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: mongoose.Types.ObjectId;

  @Prop({ required: true, enum: ['google', 'microsoft', 'github'] })
  provider: string; // 'google', 'microsoft', 'github'

  @Prop({ required: true })
  externalId: string; // The ID of the calendar in the external provider

  @Prop({ required: true })
  name: string;

  @Prop()
  color?: string;

  @Prop({ default: false })
  isPrimary: boolean;

  @Prop({ default: true })
  isWritable: boolean;

  @Prop({ default: false })
  isSynced: boolean; // Whether this calendar is selected for sync

  @Prop()
  description?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>; // Provider-specific extra data

  @Prop()
  webhookChannelId?: string;

  @Prop()
  webhookResourceId?: string;

  @Prop({ type: Date })
  webhookExpiration?: Date;
}

export const ConnectedCalendarSchema =
  SchemaFactory.createForClass(ConnectedCalendar);

ConnectedCalendarSchema.index({ userId: 1, provider: 1 });
ConnectedCalendarSchema.index({ userId: 1, externalId: 1 }, { unique: true });
