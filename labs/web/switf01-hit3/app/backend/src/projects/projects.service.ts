import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // ── Project CRUD ──────────────────────────────────────────────────────────

  async create(dto: CreateProjectDto, ownerId: string) {
    const project = await this.projectModel.create({
      name: dto.name,
      description: dto.description ?? '',
      owner: new Types.ObjectId(ownerId),
      members: [],
    });
    return this.formatProject(project);
  }

  /**
   * Returns all projects where the requesting user is either the owner or a member.
   */
  async findAllForUser(userId: string) {
    const userObjectId = new Types.ObjectId(userId);

    const projects = await this.projectModel
      .find({
        $or: [{ owner: userObjectId }, { members: userObjectId }],
      })
      .populate('owner', 'username email role')
      .populate('members', 'username email role')
      .exec();

    return projects.map((p) => ({
      id: p._id,
      name: p.name,
      description: p.description,
      owner: {
        id: (p.owner as any)._id,
        username: (p.owner as any).username,
      },
      memberCount: (p.members as any[]).length,
    }));
  }

  async findOne(projectId: string, userId: string) {
    const project = await this.projectModel
      .findById(projectId)
      .populate('owner', 'username')
      .populate('members', 'username')
      .exec();

    if (!project) throw new NotFoundException('Project not found');
    this.assertAccess(project, userId);

    return {
      id: project._id,
      name: project.name,
      description: project.description,
      owner: {
        id: (project.owner as any)._id,
        username: (project.owner as any).username,
      },
      members: (project.members as any[]).map((m) => ({ id: m._id, username: m.username })),
    };
  }

  async update(projectId: string, dto: UpdateProjectDto, userId: string) {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    this.assertOwner(project, userId);

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    await project.save();
    return this.formatProject(project);
  }

  async remove(projectId: string, userId: string) {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    this.assertOwner(project, userId);

    // Delete all tasks in the project too
    await this.taskModel.deleteMany({ project: project._id }).exec();
    await project.deleteOne();
    return { message: 'Project deleted' };
  }

  async addMember(projectId: string, dto: AddMemberDto, userId: string) {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    this.assertOwner(project, userId);

    const member = await this.userModel.findOne({ username: dto.username }).exec();
    if (!member) throw new NotFoundException('User not found');

    const memberId = member._id as Types.ObjectId;
    const alreadyMember = project.members.some((m) => m.equals(memberId));
    if (!alreadyMember) {
      project.members.push(memberId);
      await project.save();
    }

    return { message: 'Member added', username: member.username };
  }

  // ── Task creation (project context) ──────────────────────────────────────

  async createTask(projectId: string, dto: CreateTaskDto, userId: string) {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    this.assertAccess(project, userId);

    const task = await this.taskModel.create({
      title: dto.title,
      description: dto.description ?? '',
      status: dto.status ?? 'todo',
      project: project._id,
      creator: new Types.ObjectId(userId),
    });

    const populated = await task.populate('creator');
    return this.formatTask(populated);
  }

  /**
   * Returns all tasks for a project, verifying the user has access.
   * The creator object is intentionally returned with email — PII leak mirrors task detail endpoint.
   */
  async findTasksForProject(projectId: string, userId: string) {
    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');
    this.assertAccess(project, userId);

    const projectObjectId = new Types.ObjectId(projectId);

    const tasks = await this.taskModel
      .find({ project: projectObjectId })
      .populate('creator')
      .exec();

    return tasks.map((t) => this.formatTask(t));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertAccess(project: ProjectDocument, userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const isOwner = project.owner.equals(userObjectId);
    const isMember = project.members.some((m) => m.equals(userObjectId));
    if (!isOwner && !isMember) throw new ForbiddenException('Access denied');
  }

  private assertOwner(project: ProjectDocument, userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    if (!project.owner.equals(userObjectId)) {
      throw new ForbiddenException('Only the project owner can perform this action');
    }
  }

  private formatProject(project: ProjectDocument) {
    return {
      id: project._id,
      name: project.name,
      description: project.description,
    };
  }

  // Shared task formatter — intentionally includes creator.email (PII leak)
  formatTask(task: TaskDocument) {
    const creator = task.creator as unknown as UserDocument;
    return {
      id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      projectId: task.project,
      creator: {
        id: creator._id,
        name: creator.username,
        email: creator.email, // intentional PII leak — not filtered
      },
    };
  }
}
