import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { AuthService } from "./auth.service"
import { NotificationService } from "../notifications/notification.service"
import { Platform } from "../../enums/index"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"
import { Config } from "../../config/config"
import type { TokenPair } from "./interfaces/auth.interface"

// ─── Schemas ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  deviceId: z.string().default("web"),
  platform: z.nativeEnum(Platform).default(Platform.WEB),
})

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
  deviceId: z.string().default("web"),
  platform: z.nativeEnum(Platform).default(Platform.WEB),
})

const googleSignInSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
  deviceId: z.string().default("web"),
  platform: z.nativeEnum(Platform).default(Platform.WEB),
})

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email"),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

// ─── Cookie helpers ────────────────────────────────────────────────────────────

const IS_PROD = Config.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000 // 30d
const ACCESS_MAX_AGE = 15 * 60 * 1000 // 15m

function setAuthCookies(res: Response, tokens: TokenPair): void {
  res.cookie("accessToken", tokens.accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict",
    maxAge: ACCESS_MAX_AGE,
  })
  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict",
    maxAge: REFRESH_MAX_AGE,
  })
}

function clearAuthCookies(res: Response): void {
  const opts = { httpOnly: true, secure: IS_PROD, sameSite: "strict" as const }
  res.clearCookie("accessToken", opts)
  res.clearCookie("refreshToken", opts)
}

// ─── Controller ────────────────────────────────────────────────────────────────

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
  ) {}

  async self(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await this.authService.self(req.user!.id)
      res.json(success(user, "User fetched"))
    } catch (err) {
      next(err)
    }
  }

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.authService.register(parsed.data)
      setAuthCookies(res, result)
      res.status(201).json(success(result, "Registration successful"))
    } catch (err) {
      next(err)
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.authService.login(parsed.data)
      setAuthCookies(res, result)
      res.json(success(result, "Login successful"))
    } catch (err) {
      next(err)
    }
  }

  // validateRefreshToken middleware already validated — record is on req.refreshToken
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.authService.refresh(req.refreshToken!.record)
      setAuthCookies(res, result)
      res.json(success(result, "Token refreshed"))
    } catch (err) {
      next(err)
    }
  }

  // validateRefreshToken middleware already validated — record is on req.refreshToken
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const record = req.refreshToken!.record
      await this.authService.logout(record)
      // Remove FCM token for this device so push stops after logout
      await this.notificationService.unregisterDevice(record.userId, record.deviceId)
      clearAuthCookies(res)
      res.json(success(null, "Logged out successfully"))
    } catch (err) {
      next(err)
    }
  }

  async googleSignIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = googleSignInSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.authService.googleSignIn(parsed.data)
      setAuthCookies(res, result)
      res.json(success(result, "Google sign-in successful"))
    } catch (err) {
      next(err)
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      await this.authService.forgotPassword(parsed.data.email)
      res.json(success(null, "If that email exists, a reset link has been sent"))
    } catch (err) {
      next(err)
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      await this.authService.resetPassword(parsed.data.token, parsed.data.newPassword)
      clearAuthCookies(res)
      res.json(success(null, "Password reset successfully"))
    } catch (err) {
      next(err)
    }
  }
}
