import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProviderRegistryService } from './provider.registry';
import { GoogleCalendarProvider } from './google/google.provider';
import { CalendarEventsController } from './calendar-events.controller';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { CalendarsModule } from '../calendars/calendars.module';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    forwardRef(() => GoogleCalendarModule),
    forwardRef(() => CalendarsModule),
  ],
  controllers: [CalendarEventsController],
  providers: [ProviderRegistryService, GoogleCalendarProvider],
  exports: [ProviderRegistryService, GoogleCalendarProvider],
})
export class ProvidersModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly googleProvider: GoogleCalendarProvider,
  ) {}

  /**
   * Register all providers on module initialization
   */
  onModuleInit() {
    // Register Google Calendar provider
    this.registry.register(this.googleProvider);

    // Future: Register Microsoft provider
    // this.registry.register(this.microsoftProvider);

    // Future: Register GitHub provider
    // this.registry.register(this.githubProvider);
  }
}
