import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { PomodoroService } from './pomodoro.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('pomodoro')
@UseGuards(JwtAuthGuard)
export class PomodoroController {
  constructor(private readonly pomodoroService: PomodoroService) {}

  @Post('session')
  create(@Body() createSessionDto: any, @CurrentUser('_id') userId: string) {
    return this.pomodoroService.create(createSessionDto, userId);
  }

  @Get('history')
  findAll(@CurrentUser('_id') userId: string) {
    return this.pomodoroService.findAllByUser(userId);
  }
}
