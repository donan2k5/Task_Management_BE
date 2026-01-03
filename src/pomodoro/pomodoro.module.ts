import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PomodoroService } from './pomodoro.service';
import { PomodoroController } from './pomodoro.controller';
import {
  PomodoroSession,
  PomodoroSessionSchema,
} from './schemas/pomodoro-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PomodoroSession.name, schema: PomodoroSessionSchema },
    ]),
  ],
  controllers: [PomodoroController],
  providers: [PomodoroService],
})
export class PomodoroModule {}
