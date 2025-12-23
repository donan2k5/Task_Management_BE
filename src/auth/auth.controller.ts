import {
  Controller,
  Get,
  Delete,
  Req,
  Res,
  UseGuards,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService, GoogleAuthStatus } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleProfile } from './strategies/google.strategy';
import { SyncService } from '../sync/sync.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
  ) {}

  /**
   * Sanitize userId - handles cases where userId is passed multiple times
   */
  private sanitizeUserId(userId: string): string {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    const cleanId = userId.split(',')[0].trim();
    if (!/^[a-fA-F0-9]{24}$/.test(cleanId)) {
      throw new BadRequestException('Invalid userId format');
    }
    return cleanId;
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(): Promise<void> {
    // Initiates Google OAuth2 flow
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(
    @Req() req: { user: GoogleProfile },
    @Res() res: Response,
  ): Promise<void> {
    const user = await this.authService.handleGoogleLogin(req.user);
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:8081',
    );

    // Initialize dedicated calendar and sync asynchronously
    // Don't block the redirect on this operation
    setImmediate(async () => {
      try {
        await this.syncService.initializeDedicatedCalendar(user._id.toString());
        this.logger.log(`Dedicated calendar initialized for user ${user._id}`);
      } catch (error) {
        this.logger.error(
          `Failed to initialize dedicated calendar for user ${user._id}`,
          error,
        );
      }
    });

    res.redirect(
      `${frontendUrl}/auth/callback?userId=${user._id}&success=true`,
    );
  }

  @Get('google/status/:userId')
  async getGoogleAuthStatus(
    @Param('userId') userId: string,
  ): Promise<GoogleAuthStatus> {
    const cleanUserId = this.sanitizeUserId(userId);
    return this.authService.getGoogleAuthStatus(cleanUserId);
  }

  @Delete('google/disconnect/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectGoogle(@Param('userId') userId: string): Promise<void> {
    const cleanUserId = this.sanitizeUserId(userId);
    // Disconnect sync first, then Google auth
    await this.syncService.disconnectSync(cleanUserId);
    await this.authService.disconnectGoogle(cleanUserId);
  }

  @Post('google/refresh/:userId')
  async refreshToken(
    @Param('userId') userId: string,
  ): Promise<{ success: boolean; expiresAt: Date | null }> {
    const cleanUserId = this.sanitizeUserId(userId);
    await this.authService.refreshAccessToken(cleanUserId);
    const user = await this.authService.getUserById(cleanUserId);
    return {
      success: true,
      expiresAt: user.tokenExpiry ?? null,
    };
  }
}
