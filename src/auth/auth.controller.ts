import {
  Controller,
  Get,
  Delete,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response, Request, CookieOptions } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService, GoogleAuthStatus } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleProfile } from './strategies/google.strategy';
import { SyncService } from '../sync/sync.service';
import {
  RegisterDto,
  RefreshTokenDto,
  SetPasswordDto,
  AuthResponseDto,
  AuthUserDto,
} from './dto';

// Cookie response type (without tokens in body)
interface CookieAuthResponse {
  user: AuthUserDto;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
  ) {}

  // Cookie configuration
  private getCookieOptions(maxAge: number): CookieOptions {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge,
      path: '/',
    };
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    // Access token: 15 minutes
    res.cookie('accessToken', accessToken, this.getCookieOptions(15 * 60 * 1000));
    // Refresh token: 7 days
    res.cookie('refreshToken', refreshToken, this.getCookieOptions(7 * 24 * 60 * 60 * 1000));
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
  }

  // ==================== JWT Authentication Endpoints ====================

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CookieAuthResponse> {
    const authResponse = await this.authService.register(dto);
    this.setAuthCookies(res, authResponse.accessToken, authResponse.refreshToken);
    return { user: authResponse.user };
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CookieAuthResponse> {
    const authResponse = await this.authService.login(req.user as any);
    this.setAuthCookies(res, authResponse.accessToken, authResponse.refreshToken);
    return { user: authResponse.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CookieAuthResponse> {
    // Get refresh token from cookie or body (for backward compatibility)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException('No refresh token provided');
    }

    const authResponse = await this.authService.refreshTokens(refreshToken);
    this.setAuthCookies(res, authResponse.accessToken, authResponse.refreshToken);
    return { user: authResponse.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser('_id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
      await this.authService.logout(userId, refreshToken);
    }
    this.clearAuthCookies(res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser('_id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(userId);
    this.clearAuthCookies(res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser('_id') userId: string): Promise<AuthUserDto> {
    return this.authService.getProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPassword(
    @CurrentUser('_id') userId: string,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    await this.authService.setPassword(userId, dto);
  }

  // ==================== Google OAuth Endpoints ====================

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(): Promise<void> {
    // Initiates Google OAuth2 flow
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(
    @Req() req: { user: GoogleProfile },
    @Res() res: Response,
  ): Promise<void> {
    const authResponse = await this.authService.handleGoogleLogin(req.user);
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:8081',
    );

    // Set HTTP-only cookies
    this.setAuthCookies(res, authResponse.accessToken, authResponse.refreshToken);

    // Initialize dedicated calendar and sync asynchronously
    setImmediate(async () => {
      try {
        await this.syncService.initializeDedicatedCalendar(authResponse.user.id);
        this.logger.log(
          `Dedicated calendar initialized for user ${authResponse.user.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to initialize dedicated calendar for user ${authResponse.user.id}`,
          error,
        );
      }
    });

    // Redirect WITHOUT tokens in URL (cookies already set)
    const params = new URLSearchParams({
      userId: authResponse.user.id,
      success: 'true',
    });

    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  @UseGuards(JwtAuthGuard)
  @Get('google/status')
  async getGoogleAuthStatus(
    @CurrentUser('_id') userId: string,
  ): Promise<GoogleAuthStatus> {
    return this.authService.getGoogleAuthStatus(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('google/disconnect')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectGoogle(@CurrentUser('_id') userId: string): Promise<void> {
    await this.syncService.disconnectSync(userId);
    await this.authService.disconnectGoogle(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('google/refresh')
  async refreshGoogleToken(
    @CurrentUser('_id') userId: string,
  ): Promise<{ success: boolean; expiresAt: Date | null }> {
    await this.authService.refreshGoogleAccessToken(userId);
    const updatedUser = await this.authService.getUserById(userId);
    return {
      success: true,
      expiresAt: updatedUser.googleTokenExpiry ?? null,
    };
  }

}
