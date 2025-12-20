import { Injectable } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getSummary() {
    const [todayTasks, allProjects] = await Promise.all([
      this.tasksService.findDashboardTasks(),
      this.projectsService.findDashboardProjects(),
    ]);

    return {
      tasks: todayTasks,
      // Hiển thị tất cả hoặc giới hạn tùy ý ở đây
      projects: allProjects,
      goals: this.getMockGoals(),
      upcomingEvents: this.getMockEvents(),
      headerStats: this.getMockStats(),
      user: { name: 'Nguyen', status: 'online' },
    };
  }

  // Tách các hàm Mock ra để code chính trông gọn hơn
  private getMockGoals() {
    return [
      {
        id: '1',
        name: 'Complete Vibecode MVP',
        project: 'Vibecode',
        category: 'Dev',
        progress: 73,
        color: 'hsl(262, 83%, 58%)',
      },
      {
        id: '2',
        name: 'Achieve IELTS 6.5',
        project: 'Education',
        category: 'Personal',
        progress: 40,
        color: 'hsl(174 70% 45%)',
      },
    ];
  }

  private getMockEvents() {
    return [
      {
        id: '1',
        title: 'Daily Standup',
        startTime: '09:00',
        endTime: '09:30',
        date: new Date().toISOString().split('T')[0],
        type: 'meeting',
        platform: 'Google Meet',
        color: 'bg-blue-500',
      },
    ];
  }

  private getMockStats() {
    return {
      totalHours: 42.5,
      dailyAverage: 6.2,
      trend: 12,
      weeklyData: [4.5, 6.0, 7.5, 8.2, 6.5, 5.0, 4.8],
    };
  }
}
