import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Admin, AdminDocument } from '../admin/schemas/admin.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  async seed() {
    this.logger.log('Resetting and seeding database...');

    // Wipe existing data to guarantee a fresh state on container restart
    await this.userModel.deleteMany({});
    await this.adminModel.deleteMany({});
    await this.projectModel.deleteMany({});
    await this.taskModel.deleteMany({});

    // ── Users ────────────────────────────────────────────────────────────────
    const [swilam, admin, superadmin, john_doe, sara_m, mark_t] = await this.userModel.insertMany([
      {
        username: 'swilam',
        password: await bcrypt.hash('switf123', 10),
        email: 'swilam@SwiTF01-hit3.local',
        role: 'user',
      },
      {
        username: 'admin',
        password: await bcrypt.hash('Adm1n@SwiTF01-hit32026!', 10),
        email: 'admin@SwiTF01-hit3.local',
        role: 'admin',
      },
      {
        username: 'superadmin',
        password: await bcrypt.hash('Sup3rAdm1n@SwiTF01-hit32026!', 10),
        email: 'superswilam@SwiTF01-hit3.local',
        role: 'superadmin',
      },
      {
        username: 'john_doe',
        password: await bcrypt.hash('pass123', 10),
        email: 'john_doe@SwiTF01-hit3.local',
        role: 'user',
      },
      {
        username: 'sara_m',
        password: await bcrypt.hash('pass123', 10),
        email: 'sara_m@SwiTF01-hit3.local',
        role: 'user',
      },
      {
        username: 'mark_t',
        password: await bcrypt.hash('pass123', 10),
        email: 'mark_t@SwiTF01-hit3.local',
        role: 'user',
      },
    ]);

    // ── Admins collection ────────────────────────────────────────────────────
    // Pre-seed 5 regular admins so the UI shows the limit is already reached,
    // plus the superadmin entry (whose email is hidden in the UI).
    await this.adminModel.insertMany([
      { name: 'admin1', email: 'admin1@SwiTF01-hit3.local', role: 'admin' },
      { name: 'admin2', email: 'admin2@SwiTF01-hit3.local', role: 'admin' },
      { name: 'admin3', email: 'admin3@SwiTF01-hit3.local', role: 'admin' },
      { name: 'admin4', email: 'admin4@SwiTF01-hit3.local', role: 'admin' },
      { name: 'admin5', email: 'admin5@SwiTF01-hit3.local', role: 'admin' },
      {
        name: 'superadmin',
        email: 'superswilam@SwiTF01-hit3.local',
        role: 'superadmin',
      },
    ]);

    // ── Project ──────────────────────────────────────────────────────────────
    const [project1, project2, project3] = await this.projectModel.insertMany([
      {
        name: 'Q3 Platform Delivery',
        description: 'Internal platform delivery project for Q3 2026.',
        owner: john_doe._id,
        members: [swilam._id, sara_m._id],
      },
      {
        name: 'Frontend Redesign',
        description: 'Modernizing the user interface.',
        owner: sara_m._id,
        members: [swilam._id, mark_t._id],
      },
      {
        name: 'Internal API Migration',
        description: 'Migrating legacy endpoints to v2.',
        owner: admin._id,
        members: [swilam._id, john_doe._id],
      }
    ]);

    // ── Tasks ────────────────────────────────────────────────────────────────
    await this.taskModel.insertMany([
      // Project 1 tasks
      {
        title: 'Set up CI/CD pipeline',
        description: '',
        status: 'done',
        project: project1._id,
        creator: john_doe._id,
      },
      {
        title: 'Write unit tests for auth module',
        description: '',
        status: 'in_progress',
        project: project1._id,
        creator: john_doe._id,
      },
      {
        title: 'Review PR #42',
        description: '',
        status: 'todo',
        project: project1._id,
        creator: john_doe._id,
      },
      // Project 2 tasks
      {
        title: 'Design new landing page mockups',
        description: '',
        status: 'in_progress',
        project: project2._id,
        creator: sara_m._id,
      },
      {
        title: 'Update color palette',
        description: '',
        status: 'todo',
        project: project2._id,
        creator: sara_m._id,
      },
      // Project 3 tasks
      {
        title: 'Migrate user endpoints to v2',
        description: '',
        status: 'in_progress',
        project: project3._id,
        creator: john_doe._id,
      },
      {
        title: 'Document gRPC schema',
        description: '',
        status: 'todo',
        project: project3._id,
        creator: admin._id,
      },
      {
        title: 'Fix rate limiting bug',
        description: '',
        status: 'done',
        project: project3._id,
        creator: sara_m._id,
      },
    ]);

    this.logger.log('Database seeded successfully');
  }
}
