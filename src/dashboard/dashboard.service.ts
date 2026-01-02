import { Injectable } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
  ) {}

  async getSummary(userId: string) {
    const [todayTasks, overdueTasks, allProjects, user] = await Promise.all([
      this.tasksService.findDashboardTasks(userId),
      this.tasksService.findOverdueTasks(userId),
      this.projectsService.findDashboardProjects(userId),
      this.usersService.findOne(userId),
    ]);

    return {
      tasks: todayTasks,
      overdueTasks: overdueTasks,
      projects: allProjects,
      upcomingEvents: this.getMockEvents(),
      headerStats: this.getMockStats(),
      user: { name: user?.name || 'User', status: 'online' },
    };
  }

  async getWeeklyReport(userId: string, dateStr?: string) {
    const now = dateStr ? new Date(dateStr) : new Date();
    const day = now.getDay(); // 0 (Sun) - 6 (Sat)

    // Calculate start of week (Monday)
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const completedTasks =
      await this.tasksService.findCompletedTasksInDateRange(
        userId,
        startOfWeek,
        endOfWeek,
      );

    // Helper function to format date in local timezone (YYYY-MM-DD)
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Group by day of week using local dates
    const dailyLogs = Array(7)
      .fill(null)
      .map((_, index) => {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + index);
        const dateKey = formatLocalDate(date);

        const tasksForDay = completedTasks.filter((task) => {
          const taskDate = task.updatedAt
            ? new Date(task.updatedAt)
            : new Date();
          return formatLocalDate(taskDate) === dateKey;
        });

        return {
          date: dateKey,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          tasks: tasksForDay,
          count: tasksForDay.length,
        };
      });

    return {
      startOfWeek,
      endOfWeek,
      totalCompleted: completedTasks.length,
      dailyLogs,
    };
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
