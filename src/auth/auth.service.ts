import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { User, UserDocument } from '../users/user.schema';
import { GoogleProfile } from './strategies/google.strategy';

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
  ) {
    this.oauth2Client = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  async handleGoogleLogin(googleProfile: GoogleProfile): Promise<UserDocument> {
    const { googleId, email, name, avatar, accessToken, refreshToken } =
      googleProfile;

    let user = await this.userModel.findOne({ googleId });

    if (!user) {
      user = await this.userModel.findOne({ email });

      if (user) {
        user.googleId = googleId;
        user.accessToken = accessToken;
        user.refreshToken = refreshToken;
        user.tokenExpiry = new Date(Date.now() + 3600 * 1000);
        user.avatar = avatar;
        await user.save();
      } else {
        user = await this.userModel.create({
          googleId,
          email,
          name,
          avatar,
          accessToken,
          refreshToken,
          tokenExpiry: new Date(Date.now() + 3600 * 1000),
        });
      }
    } else {
      user.accessToken = accessToken;
      if (refreshToken) {
        user.refreshToken = refreshToken;
      }
      user.tokenExpiry = new Date(Date.now() + 3600 * 1000);
      user.avatar = avatar;
      user.name = name;
      await user.save();
    }

    this.logger.log(`User ${email} authenticated with Google`);
    return user;
  }

  async getGoogleAuthStatus(userId: string): Promise<GoogleAuthStatus> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      return { isConnected: false };
    }

    const isConnected = !!(user.googleId && user.accessToken);

    return {
      isConnected,
      email: isConnected ? user.email : undefined,
      lastSyncedAt: undefined,
    };
  }

  async hasValidGoogleAuth(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);

    if (!user || !user.googleId || !user.accessToken) {
      return false;
    }

    if (user.tokenExpiry && new Date() > user.tokenExpiry) {
      if (!user.refreshToken) {
        return false;
      }
      try {
        await this.refreshAccessToken(userId);
        return true;
      } catch {
        return false;
      }
    }

    return true;
  }

  async refreshAccessToken(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException(
        'No refresh token available. Please reconnect Google Calendar.',
      );
    }

    try {
      this.oauth2Client.setCredentials({
        refresh_token: user.refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      user.accessToken = credentials.access_token ?? undefined;
      user.tokenExpiry = new Date(credentials.expiry_date || Date.now() + 3600 * 1000);

      if (credentials.refresh_token) {
        user.refreshToken = credentials.refresh_token;
      }

      await user.save();
      this.logger.log(`Token refreshed for user ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to refresh token for user ${userId}`, error);
      user.accessToken = undefined;
      user.refreshToken = undefined;
      user.tokenExpiry = undefined;
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

    user.googleId = undefined;
    user.accessToken = undefined;
    user.refreshToken = undefined;
    user.tokenExpiry = undefined;

    await user.save();
    this.logger.log(`User ${user.email} disconnected from Google`);
  }

  async getAccessToken(userId: string): Promise<string> {
    const user = await this.userModel.findById(userId);

    if (!user || !user.accessToken) {
      throw new UnauthorizedException('Google Calendar not connected');
    }

    const bufferTime = 5 * 60 * 1000;
    if (user.tokenExpiry && new Date(user.tokenExpiry.getTime() - bufferTime) < new Date()) {
      await this.refreshAccessToken(userId);
      const updatedUser = await this.userModel.findById(userId);
      if (!updatedUser?.accessToken) {
        throw new UnauthorizedException('Failed to refresh access token');
      }
      return updatedUser.accessToken;
    }

    return user.accessToken;
  }

  async getUserById(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
