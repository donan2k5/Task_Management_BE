export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  authMethods: string[];
  googleConnected: boolean;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
}

export interface TokenPayload {
  sub: string; // userId
  email: string;
  iat?: number;
  exp?: number;
}
