import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true, trim: true }) // trim để xóa khoảng trắng thừa
  name: string;

  @Prop()
  description?: string;

  @Prop()
  coverImage?: string;

  @Prop({ default: 0, min: 0, max: 100 }) // Giới hạn progress từ 0-100
  progress: number;

  @Prop({
    default: 'active',
    enum: ['active', 'completed', 'archived'],
  })
  status: string;

  @Prop()
  dueDate?: Date;

  @Prop()
  color?: string; // Hex color for UI display

  @Prop()
  colorId?: string; // Google Calendar event color ID (1-11)

  @Prop()
  icon?: string;

  // =============================================
  // DEPRECATED: Old per-project Google Calendar sync fields
  // Kept for backwards compatibility
  // New architecture uses User.dedicatedCalendarId instead
  // =============================================

  /** @deprecated Use User.dedicatedCalendarId instead */
  @Prop()
  googleCalendarId?: string;

  /** @deprecated No longer used in new architecture */
  @Prop({ default: false })
  syncWithGoogle: boolean;

  /** @deprecated Use Task.lastSyncedAt instead */
  @Prop({ type: Date })
  lastSyncedAt?: Date;

  /** @deprecated Use User-level sync instead */
  @Prop()
  syncUserId?: string;

  /** @deprecated Use User.webhookChannelId instead */
  @Prop()
  webhookChannelId?: string;

  /** @deprecated Use User.webhookResourceId instead */
  @Prop()
  webhookResourceId?: string;

  /** @deprecated Use User.webhookExpiration instead */
  @Prop({ type: Date })
  webhookExpiration?: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index({ googleCalendarId: 1 });
ProjectSchema.index({ syncWithGoogle: 1, googleCalendarId: 1 });
