import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleCalendarAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.params.userId || request.query.userId;

    if (!userId) {
      throw new UnauthorizedException('User ID is required');
    }

    const hasAuth = await this.authService.hasValidGoogleAuth(userId);

    if (!hasAuth) {
      throw new UnauthorizedException(
        'Google Calendar not connected. Please connect your Google account first.',
      );
    }

    return true;
  }
}
