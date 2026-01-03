import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalendarsService } from './calendars.service';
import { CalendarsController } from './calendars.controller';
import { ConnectedCalendar, ConnectedCalendarSchema } from './schemas/connected-calendar.schema';
import { CalendarEvent, CalendarEventSchema } from './schemas/calendar-event.schema';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConnectedCalendar.name, schema: ConnectedCalendarSchema },
      { name: CalendarEvent.name, schema: CalendarEventSchema },
    ]),
    GoogleCalendarModule,
  ],
  controllers: [CalendarsController],
  providers: [CalendarsService],
  exports: [CalendarsService, MongooseModule],
})
export class CalendarsModule {}

