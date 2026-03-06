import bcrypt from "bcrypt"
import { v4 as uuidv4 } from "uuid"
import { createHash } from "crypto"
import { DataSource, Repository } from "typeorm"
import { User } from "../../entities/User.entity"
import { RefreshToken } from "../../entities/RefreshToken.entity"
import { PasswordResetToken } from "../../entities/PasswordResetToken.entity"
import { Profile } from "../../entities/Profile.entity"
import { UserRole, Platform } from "../../enums/index"
import { signAccessToken } from "./jwt.util"
import { OAuth2Client } from "google-auth-library"
import { ConflictError, UnauthorizedError, ValidationError } from "../../shared/errors"
import { Config } from "../../config/config"
import type {
  RegisterParams,
  LoginParams,
  TokenPair,
  GoogleSignInParams,
} from "./interfaces/auth.interface"

const googleClient = new OAuth2Client(Config.GOOGLE_CLIENT_ID)
import logger from "../../config/logger"

export class AuthService {
  constructor(
    private readonly userRepo: Repository<User>,
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly passwordResetTokenRepo: Repository<PasswordResetToken>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
  }

  private parseExpiryToDate(expiry: string): Date {
    const match = expiry.match(/^(\d+)([mhd])$/)
    if (!match) throw new Error(`Invalid expiry format: ${expiry}`)
    const value = Number(match[1])
    const unit = match[2] as "m" | "h" | "d"
    const ms = { m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
    return new Date(Date.now() + value * ms)
  }

  // ─── Register ──────────────────────────────────────────────────────────────

  async register(params: RegisterParams): Promise<TokenPair> {
    const existing = await this.userRepo.findOne({ where: { email: params.email } })
    if (existing) throw new ConflictError("Email already registered")

    const passwordHash = await bcrypt.hash(params.password, 12)

    // Create user + profile in a single transaction
    const user = await this.dataSource.manager.transaction(async (manager) => {
      const u = manager.create(User, {
        email: params.email,
        passwordHash,
        role: UserRole.STUDENT,
      })
      await manager.save(u)
      await manager.save(manager.create(Profile, { userId: u.id }))
      return u
    })

    return this.issueTokens(user, params.deviceId, params.platform)
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(params: LoginParams): Promise<TokenPair> {
    const user = await this.userRepo.findOne({ where: { email: params.email } })

    // Same error for wrong email and wrong password — prevent enumeration
    if (!user) throw new UnauthorizedError("Invalid credentials")
    if (user.isBanned) throw new UnauthorizedError("Account suspended")
    if (!user.passwordHash) throw new UnauthorizedError("Please sign in with Google")

    const valid = await bcrypt.compare(params.password, user.passwordHash)
    if (!valid) throw new UnauthorizedError("Invalid credentials")

    return this.issueTokens(user, params.deviceId, params.platform)
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────
  // Note: token is already validated by validateRefreshToken middleware

  async refresh(stored: RefreshToken): Promise<TokenPair> {
    // Rotate — revoke old, issue new
    stored.revoked = true
    stored.revokedAt = new Date()
    await this.refreshTokenRepo.save(stored)

    return this.issueTokens(stored.user, stored.deviceId, stored.platform)
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  // Note: token is already validated by validateRefreshToken middleware

  async logout(stored: RefreshToken): Promise<void> {
    await this.refreshTokenRepo.update({ id: stored.id }, { revoked: true, revokedAt: new Date() })
  }

  // ─── Forgot password ───────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { email } })

    // Always return — never reveal if email exists
    if (!user) return

    // Invalidate any previous unused reset tokens
    await this.passwordResetTokenRepo.update({ userId: user.id, used: false }, { used: true })

    const plainToken = uuidv4()
    const tokenHash = this.hashToken(plainToken)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await this.passwordResetTokenRepo.save(
      this.passwordResetTokenRepo.create({ userId: user.id, tokenHash, expiresAt }),
    )

    // TODO: send email — emailService.sendPasswordReset(email, plainToken)
    // Dev only: log reset link to console
    if (Config.NODE_ENV === "development") {
      logger.debug(
        `Password reset link for ${email}: ${Config.APP_URL}/reset-password?token=${plainToken}`,
      )
    }
  }

  // ─── Reset password ────────────────────────────────────────────────────────

  async resetPassword(plainToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(plainToken)

    const resetToken = await this.passwordResetTokenRepo.findOne({
      where: { tokenHash },
      relations: ["user"],
    })

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      throw new ValidationError("Invalid or expired reset token")
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await this.userRepo.update(resetToken.userId, { passwordHash })

    resetToken.used = true
    await this.passwordResetTokenRepo.save(resetToken)

    // Revoke all refresh tokens — force re-login on all devices
    await this.refreshTokenRepo.update(
      { userId: resetToken.userId, revoked: false },
      { revoked: true, revokedAt: new Date() },
    )
  }

  // ─── Google Sign-In ────────────────────────────────────────────────────────

  async googleSignIn(params: GoogleSignInParams): Promise<TokenPair & { isNew: boolean }> {
    let googleId: string
    let email: string
    let email_verified: boolean

    if (params.idToken) {
      // Mobile / credential button flow — verify ID token locally
      const ticket = await googleClient.verifyIdToken({
        idToken: params.idToken,
        audience: Config.GOOGLE_CLIENT_ID,
      })
      const payload = ticket.getPayload()
      if (!payload || !payload.email) throw new UnauthorizedError("Invalid Google token")
      googleId = payload.sub!
      email = payload.email
      email_verified = payload.email_verified ?? true
    } else if (params.accessToken) {
      // Web useGoogleLogin flow — verify via userinfo endpoint
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      })
      if (!res.ok) throw new UnauthorizedError("Invalid Google access token")
      const info = (await res.json()) as { sub: string; email?: string; email_verified?: boolean }
      if (!info.email) throw new UnauthorizedError("Google did not return an email")
      googleId = info.sub
      email = info.email
      email_verified = info.email_verified ?? true
    } else {
      throw new UnauthorizedError("No Google token provided")
    }

    // Find existing user by googleId or email
    let user = await this.userRepo.findOne({
      where: [{ googleId }, { email }],
    })

    let isNew = false

    if (user) {
      if (user.isBanned) throw new UnauthorizedError("Account suspended")

      // Link googleId if user registered with email/password before
      if (!user.googleId) {
        await this.userRepo.update(user.id, { googleId, isVerified: true })
        user.googleId = googleId
        user.isVerified = true
      }
    } else {
      isNew = true
      // Auto-register new user + create profile in one transaction
      user = await this.dataSource.manager.transaction(async (manager) => {
        const u = manager.create(User, {
          email,
          googleId,
          passwordHash: null,
          role: UserRole.STUDENT,
          isVerified: email_verified ?? true,
        })
        await manager.save(u)
        await manager.save(manager.create(Profile, { userId: u.id }))
        logger.info(`New user registered via Google: ${email}`)
        return u
      })
    }

    const tokens = await this.issueTokens(user, params.deviceId, params.platform)
    return { ...tokens, isNew }
  }

  // ─── Self ──────────────────────────────────────────────────────────────────

  async self(
    userId: string,
  ): Promise<Omit<User, "passwordHash"> & { onboardingCompleted: boolean }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ["profile"],
    })
    if (!user) throw new UnauthorizedError("User not found")
    const { passwordHash: _pw, ...safe } = user
    return {
      ...safe,
      onboardingCompleted: user.profile?.onboardingCompleted ?? false,
    }
  }

  // ─── Private: issue token pair ─────────────────────────────────────────────

  private async issueTokens(user: User, deviceId: string, platform: Platform): Promise<TokenPair> {
    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    })

    const plainRefreshToken = uuidv4()
    const tokenHash = this.hashToken(plainRefreshToken)
    const expiresAt = this.parseExpiryToDate(Config.JWT_REFRESH_EXPIRY)

    // One active session per device — revoke previous token for this device
    await this.refreshTokenRepo.update(
      { userId: user.id, deviceId, revoked: false },
      { revoked: true, revokedAt: new Date() },
    )

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: user.id,
        tokenHash,
        deviceId,
        platform,
        expiresAt,
      }),
    )

    // Load profile to get onboardingCompleted (use cached relation if already loaded)
    const profile =
      user.profile ??
      (await this.userRepo.findOne({ where: { id: user.id }, relations: ["profile"] }))?.profile

    return {
      accessToken,
      refreshToken: plainRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: profile?.displayName ?? user.email.split("@")[0],
        role: user.role,
        onboardingCompleted: profile?.onboardingCompleted ?? false,
      },
    }
  }
}
