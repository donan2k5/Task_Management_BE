import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { UserDocument } from '../../users/user.schema';

@Injectable()
export class GoogleCalendarAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // First try to get userId from JWT authenticated user
    const user = request.user as UserDocument | undefined;
    let userId: string | undefined;

    if (user && user._id) {
      userId = user._id.toString();
    } else {
      // Fallback to query/params for backward compatibility (legacy endpoints)
      userId = request.params.userId || request.query.userId;
    }

    if (!userId) {
      throw new UnauthorizedException(
        'Authentication required. Please login first.',
      );
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
