import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  // Local Auth Fields
  @Prop()
  passwordHash?: string; // bcrypt hash (null for Google-only users)

  // JWT Refresh Token Management
  @Prop({ type: [String], default: [] })
  refreshTokens: string[]; // Array of hashed refresh tokens for multi-device

  // Auth Methods Tracking
  @Prop({ type: [String], default: [] })
  authMethods: string[]; // ['google', 'local']

  // Account Status
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date })
  lastLoginAt?: Date;

  // Google OAuth Fields
  @Prop()
  googleId?: string;

  @Prop()
  googleAccessToken?: string; // Renamed from accessToken for clarity

  @Prop()
  googleRefreshToken?: string; // Renamed from refreshToken for clarity

  @Prop({ type: Date })
  googleTokenExpiry?: Date; // Renamed from tokenExpiry for clarity

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
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ dedicatedCalendarId: 1 });
UserSchema.index({ webhookChannelId: 1 });
