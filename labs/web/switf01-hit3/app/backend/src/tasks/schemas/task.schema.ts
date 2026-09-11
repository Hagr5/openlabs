import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({
    required: true,
    enum: ['todo', 'in_progress', 'done'],
    default: 'todo',
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  project: Types.ObjectId;

  // creator is intentionally populated with full User object (including email) — PII leak vulnerability
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creator: Types.ObjectId;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
