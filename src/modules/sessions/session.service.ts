import { Repository } from "typeorm"
import { CallSession } from "../../entities/CallSession.entity"
import { SessionRating } from "../../entities/SessionRating.entity"
import { Profile } from "../../entities/Profile.entity"
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from "../../shared/errors"
import logger from "../../config/logger"

interface AdminSessionFilters {
  page: number
  limit: number
  search?: string
  level?: string
  dateFrom?: string
  dateTo?: string
}

export class SessionService {
  constructor(
    private readonly sessionRepo: Repository<CallSession>,
    private readonly ratingRepo: Repository<SessionRating>,
    private readonly profileRepo: Repository<Profile>,
  ) {}

  // ─── Called from matchmaking gateway when two users are matched ───────────────

  async createSession(
    roomId: string,
    userAId: string,
    userBId: string,
    level: string,
    topic: string | null,
  ): Promise<void> {
    try {
      const session = this.sessionRepo.create({
        roomId,
        userAId,
        userBId,
        level,
        topic,
        startedAt: new Date(),
      })
      await this.sessionRepo.save(session)
      logger.debug(`Session created roomId=${roomId}`)
    } catch (err) {
      // Ignore duplicate — match_found can rarely fire twice in edge cases
      const msg = err instanceof Error ? err.message : ""
      if (msg.includes("duplicate") || msg.includes("unique")) {
        logger.warn(`Duplicate session ignored roomId=${roomId}`)
        return
      }
      throw err
    }
  }

  // ─── Called from signaling gateway (end_call) and matchmaking (disconnect) ────
  // Idempotent: safe to call twice (skips if already ended)

  async endSession(roomId: string, endedByUserId: string): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { roomId } })
    if (!session || session.endedAt) return // not found or already ended

    const now = new Date()
    const durationSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)

    session.endedAt = now
    session.durationSeconds = durationSeconds
    session.endedById = endedByUserId
    await this.sessionRepo.save(session)

    // Update stats for both participants
    await Promise.all([
      this.updateProfileStats(session.userAId, durationSeconds),
      this.updateProfileStats(session.userBId, durationSeconds),
    ])

    logger.info(`Session ended roomId=${roomId} by=${endedByUserId} duration=${durationSeconds}s`)
  }

  // ─── HTTP: GET /sessions ──────────────────────────────────────────────────────

  async getMyHistory(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ sessions: CallSession[]; total: number; page: number; limit: number }> {
    const [sessions, total] = await this.sessionRepo.findAndCount({
      where: [{ userAId: userId }, { userBId: userId }],
      order: { startedAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    })
    return { sessions, total, page, limit }
  }

  // ─── HTTP: GET /sessions/:id ──────────────────────────────────────────────────

  async getSession(sessionId: string, userId: string): Promise<CallSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } })
    if (!session) throw new NotFoundError("Session not found")
    if (session.userAId !== userId && session.userBId !== userId) {
      throw new ForbiddenError("You are not a participant of this session")
    }
    return session
  }

  // ─── HTTP: POST /sessions/:id/rate ────────────────────────────────────────────

  async rateSession(
    sessionId: string,
    raterId: string,
    stars: number,
    feedback?: string | null,
  ): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } })
    if (!session) throw new NotFoundError("Session not found")

    if (session.userAId !== raterId && session.userBId !== raterId) {
      throw new ForbiddenError("You are not a participant of this session")
    }

    if (!session.endedAt) throw new ValidationError("Session is still ongoing")

    const ratedId = session.userAId === raterId ? session.userBId : session.userAId

    const existing = await this.ratingRepo.findOne({ where: { sessionId, raterId } })
    if (existing) throw new ConflictError("You have already rated this session")

    const rating = this.ratingRepo.create({
      sessionId,
      raterId,
      ratedId,
      stars,
      feedback: feedback ?? null,
    })
    await this.ratingRepo.save(rating)
  }

  // ─── HTTP: GET /sessions/by-room/:roomId ──────────────────────────────────────

  async getSessionByRoom(roomId: string, userId: string): Promise<CallSession> {
    const session = await this.sessionRepo.findOne({ where: { roomId } })
    if (!session) throw new NotFoundError("Session not found")
    if (session.userAId !== userId && session.userBId !== userId) {
      throw new ForbiddenError("You are not a participant of this session")
    }
    return session
  }

  // ─── ADMIN: List all sessions ─────────────────────────────────────────────────

  async listSessionsAdmin(
    filters: AdminSessionFilters,
  ): Promise<{ sessions: CallSession[]; total: number; page: number; limit: number }> {
    const { page, limit, search, level, dateFrom, dateTo } = filters

    const qb = this.sessionRepo
      .createQueryBuilder("s")
      .leftJoinAndSelect("s.userA", "ua")
      .leftJoinAndSelect("s.userB", "ub")
      .leftJoinAndSelect("ua.profile", "pa")
      .leftJoinAndSelect("ub.profile", "pb")
      .leftJoinAndMapMany("s.ratings", SessionRating, "rt", "rt.session_id = s.id")
      .leftJoinAndSelect("rt.rater", "rtr")
      .leftJoinAndSelect("rt.rated", "rtd")
      .leftJoinAndSelect("rtr.profile", "rtrp")
      .leftJoinAndSelect("rtd.profile", "rtdp")
      .orderBy("s.startedAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)

    if (search) {
      qb.andWhere(
        "(ua.email ILIKE :s OR ub.email ILIKE :s OR pa.displayName ILIKE :s OR pb.displayName ILIKE :s)",
        { s: `%${search}%` },
      )
    }
    if (level) qb.andWhere("s.level = :level", { level })
    if (dateFrom) qb.andWhere("s.startedAt >= :dateFrom", { dateFrom: new Date(dateFrom) })
    if (dateTo) qb.andWhere("s.startedAt <= :dateTo", { dateTo: new Date(dateTo) })

    const [sessions, total] = await qb.getManyAndCount()
    return { sessions, total, page, limit }
  }

  // ─── ADMIN: Get single session with ratings ───────────────────────────────────

  async getSessionAdmin(sessionId: string): Promise<CallSession & { ratings: SessionRating[] }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ["userA", "userA.profile", "userB", "userB.profile", "endedBy"],
    })
    if (!session) throw new NotFoundError("Session not found")

    const ratings = await this.ratingRepo.find({
      where: { sessionId },
      relations: ["rater", "rater.profile", "rated", "rated.profile"],
    })

    return Object.assign(session, { ratings })
  }

  // ─── Private: update profile stats after a session ends ───────────────────────

  private async updateProfileStats(userId: string, durationSeconds: number): Promise<void> {
    const profile = await this.profileRepo.findOne({ where: { userId } })
    if (!profile) return

    const now = new Date()

    profile.totalSessions += 1
    profile.totalPracticeMins += Math.ceil(durationSeconds / 60)

    // Streak logic
    if (!profile.lastSessionAt) {
      profile.streakDays = 1
    } else {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const lastDay = new Date(
        profile.lastSessionAt.getFullYear(),
        profile.lastSessionAt.getMonth(),
        profile.lastSessionAt.getDate(),
      )
      const diffDays = Math.floor((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays === 0) {
        // Same day — streak unchanged
      } else if (diffDays === 1) {
        profile.streakDays += 1 // consecutive day
      } else {
        profile.streakDays = 1 // streak broken
      }
    }

    profile.lastSessionAt = now
    await this.profileRepo.save(profile)
  }
}
