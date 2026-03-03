import sharp from "sharp"
import { Repository } from "typeorm"
import { Profile } from "../../entities/Profile.entity"
import { StorageService } from "../../services/storage.service"
import { NotFoundError, ValidationError } from "../../shared/errors"
import logger from "../../config/logger"
import type { UpdateProfileParams } from "./interfaces/user.interface"

export class UserService {
  constructor(
    private readonly profileRepo: Repository<Profile>,
    private readonly storageService: StorageService,
  ) {}

  // ─── Get my profile ────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<Profile> {
    let profile = await this.profileRepo.findOne({ where: { userId } })
    if (!profile) {
      profile = await this.profileRepo.save(this.profileRepo.create({ userId }))
    }
    return profile
  }

  // ─── Update my profile ─────────────────────────────────────────────────────

  async updateMe(userId: string, data: UpdateProfileParams): Promise<Profile> {
    const profile = await this.getMe(userId)

    Object.assign(profile, {
      ...(data.username !== undefined && { username: data.username }),
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.nativeLanguage !== undefined && { nativeLanguage: data.nativeLanguage }),
      ...(data.englishLevel !== undefined && { englishLevel: data.englishLevel }),
      ...(data.learningGoal !== undefined && { learningGoal: data.learningGoal }),
      ...(data.country !== undefined && { country: data.country }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
    })

    // Let DB unique constraint handle race condition — catch and convert to user-friendly error
    try {
      return await this.profileRepo.save(profile)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ""
      if (msg.includes("UQ_") || msg.includes("unique")) {
        throw new ValidationError("Username already taken")
      }
      throw err
    }
  }

  // ─── Upload avatar ─────────────────────────────────────────────────────────

  async uploadAvatar(userId: string, buffer: Buffer, mimeType: string): Promise<Profile> {
    const ALLOWED = ["image/jpeg", "image/png", "image/webp"]
    if (!ALLOWED.includes(mimeType)) {
      throw new ValidationError("Only jpeg, png, webp images are allowed")
    }

    // Resize to 400×400 and convert to webp
    let processed: Buffer
    try {
      processed = await sharp(buffer)
        .resize(400, 400, { fit: "cover", position: "center" })
        .webp({ quality: 85 })
        .toBuffer()
    } catch {
      throw new ValidationError("Invalid image file")
    }

    const profile = await this.getMe(userId)

    // Delete old avatar if exists — log but don't fail if delete errors
    if (profile.avatarUrl) {
      const oldKey = this.storageService.extractKey(profile.avatarUrl)
      await this.storageService.delete(oldKey).catch((err) => {
        logger.warn("Failed to delete old avatar from storage", { key: oldKey, error: err })
      })
    }

    const key = `avatars/${userId}/${Date.now()}.webp`
    const url = await this.storageService.upload(key, processed, "image/webp")

    profile.avatarUrl = url
    return this.profileRepo.save(profile)
  }

  // ─── Delete avatar ─────────────────────────────────────────────────────────

  async deleteAvatar(userId: string): Promise<Profile> {
    const profile = await this.getMe(userId)

    if (!profile.avatarUrl) {
      throw new ValidationError("No avatar to delete")
    }

    const key = this.storageService.extractKey(profile.avatarUrl)
    await this.storageService.delete(key).catch((err) => {
      logger.warn("Failed to delete avatar from storage", { key, error: err })
    })

    profile.avatarUrl = null
    return this.profileRepo.save(profile)
  }

  // ─── Get public profile ────────────────────────────────────────────────────

  async getPublicProfile(userId: string): Promise<Partial<Profile>> {
    const profile = await this.profileRepo.findOne({ where: { userId } })
    if (!profile) throw new NotFoundError("Profile not found")

    return {
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      englishLevel: profile.englishLevel,
      country: profile.country,
      totalSessions: profile.totalSessions,
      totalPracticeMins: profile.totalPracticeMins,
      streakDays: profile.streakDays,
    }
  }
}
