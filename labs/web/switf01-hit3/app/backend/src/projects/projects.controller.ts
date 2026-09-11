import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * POST /api/v1/projects
   * Creates a new project owned by the current user.
   */
  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: any) {
    return this.projectsService.create(dto, user.userId);
  }

  /**
   * GET /api/v1/projects
   * Returns all projects the authenticated user owns or is a member of.
   */
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.projectsService.findAllForUser(user.userId);
  }

  /**
   * GET /api/v1/projects/:id
   * Returns a single project with full member list.
   */
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: any) {
    return this.projectsService.findOne(id, user.userId);
  }

  /**
   * PATCH /api/v1/projects/:id
   * Updates a project — owner only.
   */
  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: any) {
    return this.projectsService.update(id, dto, user.userId);
  }

  /**
   * DELETE /api/v1/projects/:id
   * Deletes a project and all its tasks — owner only.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: any) {
    return this.projectsService.remove(id, user.userId);
  }

  /**
   * POST /api/v1/projects/:id/members
   * Adds a member to the project by username — owner only.
   */
  @Post(':id/members')
  addMember(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: AddMemberDto, @CurrentUser() user: any) {
    return this.projectsService.addMember(id, dto, user.userId);
  }

  /**
   * POST /api/v1/projects/:id/tasks
   * Creates a new task in the project — any member.
   */
  @Post(':id/tasks')
  createTask(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CreateTaskDto, @CurrentUser() user: any) {
    return this.projectsService.createTask(id, dto, user.userId);
  }

  /**
   * GET /api/v1/projects/:id/tasks
   * Returns all tasks in a project. Response includes creator.email (PII leak mirrors task detail).
   */
  @Get(':id/tasks')
  findTasks(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: any) {
    return this.projectsService.findTasksForProject(id, user.userId);
  }
}
