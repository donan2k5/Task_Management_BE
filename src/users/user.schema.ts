import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  googleId?: string;

  @Prop()
  accessToken?: string;

  @Prop()
  refreshToken?: string;

  @Prop({ type: Date })
  tokenExpiry?: Date;

  @Prop()
  avatar?: string;

  // Dedicated Calendar Sync Fields
  @Prop()
  dedicatedCalendarId?: string; // The single "Axis" calendar ID

  @Prop({ default: false })
  autoSyncEnabled: boolean; // Whether auto-sync is enabled for this user

  @Prop()
  webhookChannelId?: string; // Webhook channel for dedicated calendar

  @Prop()
  webhookResourceId?: string; // Webhook resource for dedicated calendar

  @Prop({ type: Date })
  webhookExpiration?: Date; // When the webhook expires
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ googleId: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ dedicatedCalendarId: 1 });
UserSchema.index({ webhookChannelId: 1 });
