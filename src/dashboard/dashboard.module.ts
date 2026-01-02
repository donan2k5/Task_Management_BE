import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TasksModule, ProjectsModule, UsersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
