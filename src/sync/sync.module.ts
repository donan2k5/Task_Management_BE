import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './sync.controller';
import { WebhookController } from './webhook.controller';
import { SyncService } from './sync.service';
import { SyncSchedulerService } from './sync-scheduler.service';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { User, UserSchema } from '../users/user.schema';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { AuthModule } from '../auth/auth.module';
import { TaskMapping, TaskMappingSchema } from './schemas/task-mapping.schema';
import { ConnectedCalendar, ConnectedCalendarSchema } from '../calendars/schemas/connected-calendar.schema';
import { CalendarEvent, CalendarEventSchema } from '../calendars/schemas/calendar-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Task.name, schema: TaskSchema },
      { name: User.name, schema: UserSchema },
      { name: TaskMapping.name, schema: TaskMappingSchema },
      { name: ConnectedCalendar.name, schema: ConnectedCalendarSchema },
      { name: CalendarEvent.name, schema: CalendarEventSchema },
    ]),
    GoogleCalendarModule,
    AuthModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [SyncController, WebhookController],
  providers: [SyncService, SyncSchedulerService],
  exports: [SyncService],
})
export class SyncModule {}
