import { Controller, Get, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * GET /api/v1/tasks/:id
   *
   * Returns task detail with full creator object including email.
   * The frontend task card renders only creator.name — the leak is API-layer only.
   * This is the entry point for Vulnerability 1 in the attack chain.
   */
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: any) {
    return this.tasksService.findOne(id, user.userId);
  }

  /**
   * PATCH /api/v1/tasks/:id
   * Updates task — creator only.
   */
  @Patch(':id')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.update(id, dto, user.userId);
  }

  /**
   * DELETE /api/v1/tasks/:id
   * Deletes task — creator only.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: any) {
    return this.tasksService.remove(id, user.userId);
  }
}
