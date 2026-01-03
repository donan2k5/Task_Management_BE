/**
 * Calendar Provider Interface
 *
 * Base abstraction for all calendar integrations.
 * Implement this interface to add new providers (Microsoft, GitHub, etc.)
 */

export interface CalendarEvent {
  id: string;
  providerId: string;
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string;
  color?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
  // Source tracking
  externalId?: string;
  source: 'google' | 'microsoft' | 'github' | 'local';
}

export interface Calendar {
  id: string;
  providerId: string;
  name: string;
  description?: string;
  color?: string;
  primary?: boolean;
  accessRole?: 'owner' | 'writer' | 'reader';
}

export interface CreateEventDto {
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string;
  color?: string;
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  location?: string;
  color?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

/**
 * Calendar Provider Interface
 * All calendar providers must implement this interface
 */
export interface CalendarProvider {
  // Provider metadata
  readonly config: ProviderConfig;

  // Connection management
  isConnected(userId: string): Promise<boolean>;
  getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    email?: string;
    expiresAt?: Date;
  }>;

  // Calendar operations
  getCalendars(userId: string): Promise<Calendar[]>;

  // Event operations
  getEvents(
    userId: string,
    start: Date,
    end: Date,
    calendarId?: string,
  ): Promise<CalendarEvent[]>;

  createEvent(userId: string, event: CreateEventDto): Promise<CalendarEvent>;

  updateEvent(
    userId: string,
    calendarId: string,
    eventId: string,
    event: UpdateEventDto,
  ): Promise<CalendarEvent>;

  deleteEvent(
    userId: string,
    calendarId: string,
    eventId: string,
  ): Promise<void>;
}

/**
 * Provider Registry Type
 */
export type ProviderRegistry = Map<string, CalendarProvider>;
