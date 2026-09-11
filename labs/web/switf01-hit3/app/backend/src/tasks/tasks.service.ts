import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
  ) {}

  /**
   * GET /api/v1/tasks/:id
   *
   * Returns the task with its full creator object — including email.
   * The UI renders only creator.name; the raw API response exposes creator.email.
   * This is Vulnerability 1 (Excessive Data Exposure / PII Leak).
   */
  async findOne(taskId: string, userId: string) {
    const task = await this.taskModel
      .findById(taskId)
      .populate('creator') // full populate — no field selection — intentional
      .populate('project')
      .exec();

    if (!task) throw new NotFoundException('Task not found');

    // Verify the requesting user has access to the project this task belongs to
    const project = task.project as unknown as ProjectDocument;
    const userObjectId = new Types.ObjectId(userId);
    const isOwner = project.owner.equals(userObjectId);
    const isMember = project.members.some((m) => m.equals(userObjectId));

    if (!isOwner && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    const creator = task.creator as unknown as UserDocument;

    // Response shape matches security report section 9.7 Step 1 exactly.
    // creator.email is intentionally NOT filtered out.
    return {
      id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      creator: {
        name: creator.username,
        email: creator.email, // intentional PII leak
      },
    };
  }

  /**
   * PATCH /api/v1/tasks/:id
   * Updates task fields — creator only.
   */
  async update(taskId: string, dto: UpdateTaskDto, userId: string) {
    const task = await this.taskModel
      .findById(taskId)
      .populate('creator')
      .populate('project')
      .exec();

    if (!task) throw new NotFoundException('Task not found');

    const creator = task.creator as unknown as UserDocument;
    if (creator._id.toString() !== userId) {
      throw new ForbiddenException('Only the task creator can edit this task');
    }

    const project = task.project as unknown as ProjectDocument;
    const userObjectId = new Types.ObjectId(userId);
    const isOwner = project.owner.equals(userObjectId);
    const isMember = project.members.some((m) => m.equals(userObjectId));

    if (!isOwner && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.status !== undefined) task.status = dto.status;
    await task.save();

    return {
      id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      creator: {
        name: creator.username,
        email: creator.email, // intentional PII leak preserved
      },
    };
  }

  /**
   * DELETE /api/v1/tasks/:id
   * Deletes a task — creator only.
   */
  async remove(taskId: string, userId: string) {
    const task = await this.taskModel
      .findById(taskId)
      .populate('creator')
      .populate('project')
      .exec();

    if (!task) throw new NotFoundException('Task not found');

    const creator = task.creator as unknown as UserDocument;
    if (creator._id.toString() !== userId) {
      throw new ForbiddenException('Only the task creator can delete this task');
    }

    const project = task.project as unknown as ProjectDocument;
    const userObjectId = new Types.ObjectId(userId);
    const isOwner = project.owner.equals(userObjectId);
    const isMember = project.members.some((m) => m.equals(userObjectId));

    if (!isOwner && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    await task.deleteOne();
    return { message: 'Task deleted' };
  }
}
