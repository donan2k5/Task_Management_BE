import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getDashboardSummary(@CurrentUser('_id') userId: string) {
    return this.dashboardService.getSummary(userId);
  }

  @Get('reports/weekly')
  async getWeeklyReport(
    @CurrentUser('_id') userId: string,
    @Query('date') date?: string,
  ) {
    return this.dashboardService.getWeeklyReport(userId, date);
  }
}
