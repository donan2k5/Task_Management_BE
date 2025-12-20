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
  color?: string;

  @Prop()
  icon?: string;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
