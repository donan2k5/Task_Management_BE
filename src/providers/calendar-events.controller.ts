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
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProviderRegistryService } from './provider.registry';
import {
  CreateEventDto,
  UpdateEventDto,
  CalendarEvent,
  Calendar,
} from './provider.interface';

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsISO8601,
} from 'class-validator';

// DTOs for request validation
class CreateCalendarEventDto {
  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsISO8601()
  start: string; // ISO string

  @IsNotEmpty()
  @IsISO8601()
  end: string; // ISO string

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  location?: string;
}

class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  start?: string;

  @IsOptional()
  @IsISO8601()
  end?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  location?: string;
}

class GetEventsQueryDto {
  @IsNotEmpty()
  @IsString()
  start: string;

  @IsNotEmpty()
  @IsString()
  end: string;

  @IsOptional()
  @IsString()
  calendarId?: string;
}

/**
 * Calendar Events Controller
 *
 * Unified API for managing calendar events across all providers.
 * Routes: /providers/:providerId/...
 */
@Controller('providers')
@UseGuards(JwtAuthGuard)
export class CalendarEventsController {
  constructor(private readonly registry: ProviderRegistryService) {}

  /**
   * Get all available providers with their configs
   */
  @Get()
  getProviders() {
    return this.registry.getConfigs();
  }

  /**
   * Get connected providers for current user
   */
  @Get('connected')
  async getConnectedProviders(@CurrentUser('_id') userId: string) {
    const connected = await this.registry.getConnectedProviders(userId);
    return connected.map((p) => p.config);
  }

  /**
   * Get connection status for a provider
   */
  @Get(':providerId/status')
  async getProviderStatus(
    @CurrentUser('_id') userId: string,
    @Param('providerId') providerId: string,
  ) {
    const provider = this.getProvider(providerId);
    return provider.getConnectionStatus(userId);
  }

  /**
   * Get calendars for a provider
   */
  @Get(':providerId/calendars')
  async getCalendars(
    @CurrentUser('_id') userId: string,
    @Param('providerId') providerId: string,
  ): Promise<Calendar[]> {
    const provider = this.getProvider(providerId);
    return provider.getCalendars(userId);
  }

  /**
   * Get events from a provider
   */
  @Get(':providerId/events')
  async getEvents(
    @CurrentUser('_id') userId: string,
    @Param('providerId') providerId: string,
    @Query() query: any, // Bypassing ValidationPipe whitelist for now
  ): Promise<CalendarEvent[]> {
    const provider = this.getProvider(providerId);

    if (!query.start || !query.end) {
      throw new BadRequestException('start and end query params are required');
    }

    const start = new Date(query.start);
    const end = new Date(query.end);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    return provider.getEvents(userId, start, end, query.calendarId);
  }

  /**
   * Create event on a provider
   */
  @Post(':providerId/events')
  async createEvent(
    @CurrentUser('_id') userId: string,
    @Param('providerId') providerId: string,
    @Body() dto: CreateCalendarEventDto,
  ): Promise<CalendarEvent> {
    const provider = this.getProvider(providerId);

    // Validate required fields
    if (!dto.title) {
      throw new BadRequestException('title is required');
    }
    if (!dto.start || !dto.end) {
      throw new BadRequestException('start and end are required');
    }

    const start = new Date(dto.start);
    const end = new Date(dto.end);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format for start or end');
    }

    const event: CreateEventDto = {
      calendarId: dto.calendarId || 'primary',
      title: dto.title,
      description: dto.description,
      start,
      end,
      allDay: dto.allDay,
      location: dto.location,
    };

    return provider.createEvent(userId, event);
  }

  /**
   * Update event on a provider
   */
  @Patch(':providerId/calendars/:calendarId/events/:eventId')
  async updateEvent(
    @CurrentUser('_id') userId: string,
    @Param('providerId') providerId: string,
    @Param('calendarId') calendarId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ): Promise<CalendarEvent> {
    const provider = this.getProvider(providerId);

    // Validate dates if provided
    let start: Date | undefined;
    let end: Date | undefined;

    if (dto.start) {
      start = new Date(dto.start);
      if (isNaN(start.getTime())) {
        throw new BadRequestException('Invalid date format for start');
      }
    }

    if (dto.end) {
      end = new Date(dto.end);
      if (isNaN(end.getTime())) {
        throw new BadRequestException('Invalid date format for end');
      }
    }

    const event: UpdateEventDto = {
      title: dto.title,
      description: dto.description,
      start,
      end,
      allDay: dto.allDay,
      location: dto.location,
    };

    return provider.updateEvent(userId, calendarId, eventId, event);
  }

  /**
   * Delete event from a provider
   */
  @Delete(':providerId/calendars/:calendarId/events/:eventId')
  async deleteEvent(
    @CurrentUser('_id') userId: string,
    @Param('providerId') providerId: string,
    @Param('calendarId') calendarId: string,
    @Param('eventId') eventId: string,
  ): Promise<void> {
    const provider = this.getProvider(providerId);
    await provider.deleteEvent(userId, calendarId, eventId);
  }

  // ==================== Private Helpers ====================

  private getProvider(providerId: string) {
    const provider = this.registry.get(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider "${providerId}" not found`);
    }
    return provider;
  }
}
