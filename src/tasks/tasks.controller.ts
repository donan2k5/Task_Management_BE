import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('calendar')
  async getCalendarEvents(
    @CurrentUser('_id') userId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    if (!start || !end) {
      throw new BadRequestException('Start and end dates are required');
    }

    return this.tasksService.findTasksInInterval(userId, start, end);
  }

  @Get('unscheduled')
  async getUnscheduledTasks(@CurrentUser('_id') userId: string) {
    return this.tasksService.findAllUnscheduled(userId);
  }

  @Post()
  create(
    @CurrentUser('_id') userId: string,
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(userId, createTaskDto);
  }

  @Get()
  findAll(@CurrentUser('_id') userId: string, @Query('status') status?: string) {
    return this.tasksService.findAll(userId, status);
  }

  @Get(':id')
  findOne(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.tasksService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('_id') userId: string,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(userId, id, updateTaskDto);
  }

  @Delete(':id')
  remove(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.tasksService.remove(userId, id);
  }
}
