import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HabitsService } from './habits.service';
import { CreateHabitDto, UpdateHabitDto, LogHabitDto } from './dto/habit.dto';

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  @Post()
  create(@CurrentUser('_id') userId: string, @Body() dto: CreateHabitDto) {
    return this.habitsService.create(userId, dto);
  }

  @Get()
  findAll(@CurrentUser('_id') userId: string) {
    return this.habitsService.findAll(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.habitsService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateHabitDto,
  ) {
    return this.habitsService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('_id') userId: string, @Param('id') id: string) {
    return this.habitsService.remove(userId, id);
  }

  @Post(':id/log')
  logHabit(
    @CurrentUser('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: LogHabitDto,
  ) {
    return this.habitsService.logHabit(userId, id, dto);
  }

  @Get('logs/range')
  getLogsForRange(
    @CurrentUser('_id') userId: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    return this.habitsService.getLogsForDateRange(
      userId,
      new Date(start),
      new Date(end),
    );
  }
}
