import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HabitsController } from './habits.controller';
import { HabitsService } from './habits.service';
import { Habit, HabitSchema } from './schemas/habit.schema';
import { HabitLog, HabitLogSchema } from './schemas/habit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Habit.name, schema: HabitSchema },
      { name: HabitLog.name, schema: HabitLogSchema },
    ]),
  ],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
