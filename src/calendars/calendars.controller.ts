import { Controller, Get, Post, Patch, Query, Param, Body, UseGuards } from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('calendars')
@UseGuards(JwtAuthGuard)
export class CalendarsController {
  constructor(private readonly calendarsService: CalendarsService) {}

  @Get()
  findAll(@CurrentUser('_id') userId: string) {
    return this.calendarsService.findAllCalendars(userId);
  }

  @Get('syncable')
  getSyncableCalendars(@CurrentUser('_id') userId: string) {
    return this.calendarsService.getSyncableCalendars(userId);
  }

  @Patch(':calendarId/sync')
  async toggleSync(
    @CurrentUser('_id') userId: string,
    @Param('calendarId') calendarId: string,
    @Body('isSynced') isSynced: boolean,
  ) {
    return this.calendarsService.toggleCalendarSync(userId, calendarId, isSynced);
  }

  @Post('sync/refresh')
  refreshCalendars(@CurrentUser('_id') userId: string) {
    return this.calendarsService.refreshCalendars(userId);
  }

  @Post('sync/events')
  async syncEvents(@CurrentUser('_id') userId: string) {
    const count = await this.calendarsService.syncAllCalendarsEvents(userId);
    return { synced: count };
  }

  @Get('events')
  async getEvents(
    @CurrentUser('_id') userId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('calendarId') calendarId?: string,
  ) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return this.calendarsService.getEvents(userId, startDate, endDate, calendarId);
  }
}

