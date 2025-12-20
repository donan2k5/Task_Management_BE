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

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('calendar')
  async getCalendarEvents(
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    // Senior check: Đảm bảo start/end có giá trị
    if (!start || !end) {
      throw new BadRequestException('Start and end dates are required');
    }

    // Gọi service đã bỏ limit để lấy tất cả task trong dải ngày này
    return this.tasksService.findTasksInInterval(start, end);
  }

  @Get('unscheduled')
  async getUnscheduledTasks() {
    // Lấy các task chưa có giờ (scheduledTime) và chưa hoàn thành
    return this.tasksService.findAllUnscheduled();
  }

  @Post()
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  findAll(@Query('status') status?: string) {
    // Cho phép filter: /tasks?status=done hoặc /tasks?status=active (todo + backlog)
    return this.tasksService.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  // API quan trọng nhất cho Kéo Thả & Complete
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
