import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/user.schema';
import { GoogleProfile } from './strategies/google.strategy';
import {
  RegisterDto,
  SetPasswordDto,
  AuthResponseDto,
  AuthUserDto,
  TokenPayload,
} from './dto';

export interface GoogleAuthStatus {
  isConnected: boolean;
  email?: string;
  lastSyncedAt?: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private oauth2Client: OAuth2Client;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {
    this.oauth2Client = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  // ==================== JWT Authentication ====================

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.userModel.findOne({ email: dto.email });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.userModel.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      authMethods: ['local'],
      isActive: true,
    });

    this.logger.log(`User ${dto.email} registered with email/password`);
    return this.generateAuthResponse(user);
  }

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email });

    if (!user || !user.passwordHash) {
      return null;
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(user: UserDocument): Promise<AuthResponseDto> {
    user.lastLoginAt = new Date();
    await user.save();

    this.logger.log(`User ${user.email} logged in`);
    return this.generateAuthResponse(user);
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.userModel.findById(payload.sub);

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify refresh token exists in user's stored tokens
      const isValidToken = await this.validateStoredRefreshToken(
        user,
        refreshToken,
      );

      if (!isValidToken) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      // Remove old refresh token and generate new ones
      await this.removeRefreshToken(user, refreshToken);

      this.logger.log(`Tokens refreshed for user ${user.email}`);
      return this.generateAuthResponse(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.removeRefreshToken(user, refreshToken);
    this.logger.log(`User ${user.email} logged out`);
  }

  async logoutAll(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    user.refreshTokens = [];
    await user.save();
    this.logger.log(`User ${user.email} logged out from all devices`);
  }

  async setPassword(userId: string, dto: SetPasswordDto): Promise<void> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (user.passwordHash) {
      throw new BadRequestException(
        'Password already set. Use change password instead.',
      );
    }

    user.passwordHash = await bcrypt.hash(dto.password, 10);
    user.authMethods = [...new Set([...user.authMethods, 'local'])];
    await user.save();

    this.logger.log(`Password set for user ${user.email}`);
  }

  // ==================== Google OAuth ====================

  async handleGoogleLogin(
    googleProfile: GoogleProfile,
  ): Promise<AuthResponseDto> {
    const { googleId, email, name, avatar, accessToken, refreshToken } =
      googleProfile;

    let user = await this.userModel.findOne({ googleId });

    if (!user) {
      // Check if email exists (registered via local auth)
      user = await this.userModel.findOne({ email });

      if (user) {
        // LINK: Add Google ID to existing account
        user.googleId = googleId;
        user.googleAccessToken = accessToken;
        user.googleRefreshToken = refreshToken;
        user.googleTokenExpiry = new Date(Date.now() + 3600 * 1000);
        user.avatar = user.avatar || avatar;
        user.authMethods = [...new Set([...user.authMethods, 'google'])];
        await user.save();
        this.logger.log(`Google account linked to existing user ${email}`);
      } else {
        // CREATE: New user via Google
        user = await this.userModel.create({
          googleId,
          email,
          name,
          avatar,
          googleAccessToken: accessToken,
          googleRefreshToken: refreshToken,
          googleTokenExpiry: new Date(Date.now() + 3600 * 1000),
          authMethods: ['google'],
          isActive: true,
        });
        this.logger.log(`New user ${email} registered with Google`);
      }
    } else {
      // UPDATE: Existing Google user
      user.googleAccessToken = accessToken;
      if (refreshToken) {
        user.googleRefreshToken = refreshToken;
      }
      user.googleTokenExpiry = new Date(Date.now() + 3600 * 1000);
      user.avatar = avatar;
      user.name = name;
      await user.save();
      this.logger.log(`User ${email} logged in with Google`);
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.generateAuthResponse(user);
  }

  async getGoogleAuthStatus(userId: string): Promise<GoogleAuthStatus> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      return { isConnected: false };
    }

    const isConnected = !!(user.googleId && user.googleAccessToken);

    return {
      isConnected,
      email: isConnected ? user.email : undefined,
      lastSyncedAt: undefined,
    };
  }

  async hasValidGoogleAuth(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);

    if (!user || !user.googleId || !user.googleAccessToken) {
      return false;
    }

    if (user.googleTokenExpiry && new Date() > user.googleTokenExpiry) {
      if (!user.googleRefreshToken) {
        return false;
      }
      try {
        await this.refreshGoogleAccessToken(userId);
        return true;
      } catch {
        return false;
      }
    }

    return true;
  }

  async refreshGoogleAccessToken(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);

    if (!user || !user.googleRefreshToken) {
      throw new UnauthorizedException(
        'No refresh token available. Please reconnect Google Calendar.',
      );
    }

    try {
      this.oauth2Client.setCredentials({
        refresh_token: user.googleRefreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      user.googleAccessToken = credentials.access_token ?? undefined;
      user.googleTokenExpiry = new Date(
        credentials.expiry_date || Date.now() + 3600 * 1000,
      );

      if (credentials.refresh_token) {
        user.googleRefreshToken = credentials.refresh_token;
      }

      await user.save();
      this.logger.log(`Google token refreshed for user ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to refresh Google token for user ${userId}`,
        error,
      );
      user.googleAccessToken = undefined;
      user.googleRefreshToken = undefined;
      user.googleTokenExpiry = undefined;
      await user.save();
      throw new UnauthorizedException(
        'Failed to refresh Google token. Please reconnect Google Calendar.',
      );
    }
  }

  async disconnectGoogle(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user has another auth method
    if (
      !user.passwordHash &&
      user.authMethods.length === 1 &&
      user.authMethods.includes('google')
    ) {
      throw new BadRequestException(
        'Cannot disconnect Google. Please set a password first.',
      );
    }

    user.googleId = undefined;
    user.googleAccessToken = undefined;
    user.googleRefreshToken = undefined;
    user.googleTokenExpiry = undefined;
    user.authMethods = user.authMethods.filter((m) => m !== 'google');

    await user.save();
    this.logger.log(`User ${user.email} disconnected from Google`);
  }

  async getGoogleAccessToken(userId: string): Promise<string> {
    const user = await this.userModel.findById(userId);

    if (!user || !user.googleAccessToken) {
      throw new UnauthorizedException('Google Calendar not connected');
    }

    const bufferTime = 5 * 60 * 1000;
    if (
      user.googleTokenExpiry &&
      new Date(user.googleTokenExpiry.getTime() - bufferTime) < new Date()
    ) {
      await this.refreshGoogleAccessToken(userId);
      const updatedUser = await this.userModel.findById(userId);
      if (!updatedUser?.googleAccessToken) {
        throw new UnauthorizedException('Failed to refresh access token');
      }
      return updatedUser.googleAccessToken;
    }

    return user.googleAccessToken;
  }

  // ==================== Helper Methods ====================

  async getUserById(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async getProfile(userId: string): Promise<AuthUserDto> {
    const user = await this.getUserById(userId);
    return this.mapUserToDto(user);
  }

  private async generateAuthResponse(
    user: UserDocument,
  ): Promise<AuthResponseDto> {
    const tokens = await this.generateTokens(user);

    // Store hashed refresh token
    await this.storeRefreshToken(user, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.mapUserToDto(user),
    };
  }

  private generateTokens(user: UserDocument): {
    accessToken: string;
    refreshToken: string;
  } {
    const payload: TokenPayload = {
      sub: user._id.toString(),
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload as any, {
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRATION') ||
        '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload as any, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRATION') ||
        '7d') as any,
    });

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    user: UserDocument,
    refreshToken: string,
  ): Promise<void> {
    const hashedToken = await bcrypt.hash(refreshToken, 10);
    user.refreshTokens.push(hashedToken);

    // Limit stored tokens (max 5 devices)
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();
  }

  private async validateStoredRefreshToken(
    user: UserDocument,
    refreshToken: string,
  ): Promise<boolean> {
    for (const hashedToken of user.refreshTokens) {
      const isValid = await bcrypt.compare(refreshToken, hashedToken);
      if (isValid) {
        return true;
      }
    }
    return false;
  }

  private async removeRefreshToken(
    user: UserDocument,
    refreshToken: string,
  ): Promise<void> {
    const newTokens: string[] = [];

    for (const hashedToken of user.refreshTokens) {
      const isMatch = await bcrypt.compare(refreshToken, hashedToken);
      if (!isMatch) {
        newTokens.push(hashedToken);
      }
    }

    user.refreshTokens = newTokens;
    await user.save();
  }

  private mapUserToDto(user: UserDocument): AuthUserDto {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      authMethods: user.authMethods,
      googleConnected: !!(user.googleId && user.googleAccessToken),
    };
  }
}
