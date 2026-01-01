import { Module, NestModule, MiddlewareConsumer, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { ProjectsModule } from './projects/projects.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { SyncModule } from './sync/sync.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { Request, Response, NextFunction } from 'express';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),
    UsersModule,
    TasksModule,
    ProjectsModule,
    DashboardModule,
    AuthModule,
    GoogleCalendarModule,
    SyncModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  private readonly logger = new Logger('HTTP');

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: Request, res: Response, next: NextFunction) => {
        const { method, originalUrl } = req;
        const start = Date.now();

        res.on('finish', () => {
          const { statusCode } = res;
          const duration = Date.now() - start;
          this.logger.log(
            `${method} ${originalUrl} ${statusCode} - ${duration}ms`,
          );
        });

        next();
      })
      .forRoutes('*');
  }
}
