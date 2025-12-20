import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { TasksModule } from '../tasks/tasks.module'; // Import module này để dùng TasksService
import { ProjectsModule } from '../projects/projects.module'; // Import module này để dùng ProjectsService
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TasksModule, ProjectsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
