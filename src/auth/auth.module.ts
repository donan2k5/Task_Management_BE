import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { User, UserSchema } from '../users/user.schema';
import { GoogleCalendarAuthGuard } from './guards/google-calendar-auth.guard';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [
    PassportModule.register({ session: false }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    forwardRef(() => SyncModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, GoogleCalendarAuthGuard],
  exports: [AuthService, GoogleCalendarAuthGuard],
})
export class AuthModule {}
