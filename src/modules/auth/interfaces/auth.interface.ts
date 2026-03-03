import { Platform } from "../../../enums/index"

export interface RegisterParams {
  email: string
  password: string
  deviceId: string
  platform: Platform
}

export interface LoginParams {
  email: string
  password: string
  deviceId: string
  platform: Platform
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    name: string
    role: string
    onboardingCompleted: boolean
  }
}

export interface GoogleSignInParams {
  idToken?: string // mobile / credential flow
  accessToken?: string // web useGoogleLogin flow
  deviceId: string
  platform: Platform
}

export interface JwtPayload {
  sub: string
  email: string
  role: string
}
