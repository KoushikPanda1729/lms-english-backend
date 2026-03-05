import { Repository, In } from "typeorm"
import { User } from "../../entities/User.entity"
import { Profile } from "../../entities/Profile.entity"
import { RefreshToken } from "../../entities/RefreshToken.entity"
import { Report } from "../../entities/Report.entity"
import { CallSession } from "../../entities/CallSession.entity"
import { Course } from "../../entities/Course.entity"
import { Payment } from "../../entities/Payment.entity"
import { UserCourseProgress } from "../../entities/UserCourseProgress.entity"
import { UserRole, ReportStatus, NotificationType } from "../../enums/index"
import { PaymentStatus } from "../../enums/payment-status.enum"
import { NotFoundError, ValidationError } from "../../shared/errors"
import { NotificationService } from "../notifications/notification.service"
import logger from "../../config/logger"

interface ListUsersFilters {
  search?: string
  isBanned?: boolean
  role?: UserRole
  page: number
  limit: number
}

interface UserRow {
  user: User
  profile: Profile | null
  pendingReportsCount: number
}

export class AdminService {
  constructor(
    private readonly userRepo: Repository<User>,
    private readonly profileRepo: Repository<Profile>,
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly reportRepo: Repository<Report>,
    private readonly sessionRepo: Repository<CallSession>,
    private readonly notificationService: NotificationService,
    private readonly courseRepo: Repository<Course>,
    private readonly paymentRepo: Repository<Payment>,
    private readonly courseProgressRepo: Repository<UserCourseProgress>,
  ) {}

  // ─── GET /admin/users ─────────────────────────────────────────────────────────

  async listUsers(filters: ListUsersFilters): Promise<{
    users: UserRow[]
    total: number
    page: number
    limit: number
  }> {
    const { page, limit, search, isBanned, role } = filters

    const qb = this.userRepo
      .createQueryBuilder("u")
      .leftJoinAndSelect("u.profile", "p")
      .orderBy("u.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)

    if (search) {
      qb.andWhere("(u.email ILIKE :s OR p.displayName ILIKE :s OR p.username ILIKE :s)", {
        s: `%${search}%`,
      })
    }

    if (isBanned !== undefined) {
      qb.andWhere("u.isBanned = :isBanned", { isBanned })
    }

    if (role) {
      qb.andWhere("u.role = :role", { role })
    }

    const [rawUsers, total] = await qb.getManyAndCount()

    // Fetch pending report counts for listed users in one query
    const userIds = rawUsers.map((u) => u.id)
    const reportCounts =
      userIds.length > 0
        ? await this.reportRepo
            .createQueryBuilder("r")
            .select("r.reportedId", "reportedId")
            .addSelect("COUNT(*)", "count")
            .where("r.reportedId IN (:...ids)", { ids: userIds })
            .andWhere("r.status = :status", { status: ReportStatus.PENDING })
            .groupBy("r.reportedId")
            .getRawMany<{ reportedId: string; count: string }>()
        : []

    const countMap = new Map(reportCounts.map((r) => [r.reportedId, Number(r.count)]))

    const users: UserRow[] = rawUsers.map((u) => ({
      user: u,
      profile: (u as User & { profile?: Profile }).profile ?? null,
      pendingReportsCount: countMap.get(u.id) ?? 0,
    }))

    return { users, total, page, limit }
  }

  // ─── GET /admin/users/:id ─────────────────────────────────────────────────────

  async getUserDetail(userId: string): Promise<{
    user: User
    profile: Profile | null
    pendingReportsCount: number
    totalReportsCount: number
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundError("User not found")

    const profile = await this.profileRepo.findOne({ where: { userId } })

    const [pendingReportsCount, totalReportsCount] = await Promise.all([
      this.reportRepo.count({ where: { reportedId: userId, status: ReportStatus.PENDING } }),
      this.reportRepo.count({ where: { reportedId: userId } }),
    ])

    return { user, profile, pendingReportsCount, totalReportsCount }
  }

  // ─── PATCH /admin/users/:id/ban ───────────────────────────────────────────────

  async setUserBanned(userId: string, banned: boolean): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundError("User not found")

    if (user.role === UserRole.ADMIN) {
      throw new ValidationError("Cannot ban an admin account")
    }

    user.isBanned = banned
    await this.userRepo.save(user)

    if (banned) {
      // Revoke all sessions — forces logout on all devices immediately
      await this.refreshTokenRepo.update(
        { userId, revoked: false },
        { revoked: true, revokedAt: new Date() },
      )
      logger.info(`User ${userId} banned by admin`)
    } else {
      logger.info(`User ${userId} unbanned by admin`)
    }

    return user
  }

  // ─── PATCH /admin/users/:id/role ──────────────────────────────────────────────

  async setUserRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundError("User not found")

    user.role = role
    await this.userRepo.save(user)

    logger.info(`User ${userId} role set to ${role} by admin`)
    return user
  }

  // ─── GET /admin/stats ─────────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalUsers: number
    bannedUsers: number
    totalSessions: number
    sessionsToday: number
    activeReports: number
    newUsersThisWeek: number
    totalCourses: number
    publishedCourses: number
    avgSessionMinutes: number
  }> {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const [
      totalUsers,
      bannedUsers,
      totalSessions,
      sessionsToday,
      activeReports,
      newUsersThisWeek,
      totalCourses,
      publishedCourses,
      avgResult,
    ] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { isBanned: true } }),
      this.sessionRepo.count(),
      this.sessionRepo
        .createQueryBuilder("s")
        .where("s.startedAt >= :todayStart", { todayStart })
        .getCount(),
      this.reportRepo.count({ where: { status: ReportStatus.PENDING } }),
      this.userRepo
        .createQueryBuilder("u")
        .where("u.createdAt >= :weekAgo", { weekAgo })
        .getCount(),
      this.courseRepo.count(),
      this.courseRepo.createQueryBuilder("c").where("c.isPublished = true").getCount(),
      this.sessionRepo
        .createQueryBuilder("s")
        .select("AVG(s.durationSeconds)", "avg")
        .where("s.durationSeconds IS NOT NULL")
        .getRawOne<{ avg: string }>(),
    ])

    const avgSessionMinutes = avgResult?.avg ? Math.round(Number(avgResult.avg) / 60) : 0

    return {
      totalUsers,
      bannedUsers,
      totalSessions,
      sessionsToday,
      activeReports,
      newUsersThisWeek,
      totalCourses,
      publishedCourses,
      avgSessionMinutes,
    }
  }

  // ─── GET /admin/users/:id/courses ─────────────────────────────────────────────

  async getUserCourses(userId: string): Promise<
    {
      courseId: string
      title: string
      level: string | null
      isPremium: boolean
      totalLessons: number
      progressPercent: number
      completedLessons: number
      enrolledAt: Date
      completedAt: Date | null
      payment: { status: string; amount: number } | null
    }[]
  > {
    const progressRows = await this.courseProgressRepo
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.course", "c")
      .where("p.userId = :userId", { userId })
      .orderBy("p.enrolledAt", "DESC")
      .getMany()

    const courseIds = progressRows.map((p) => p.courseId)
    const payments =
      courseIds.length > 0
        ? await this.paymentRepo.find({ where: { userId, courseId: In(courseIds) } })
        : []

    const paymentMap = new Map(payments.map((p) => [p.courseId, p]))

    return progressRows.map((p) => {
      const course = (
        p as typeof p & {
          course?: { title: string; level: string | null; isPremium: boolean; totalLessons: number }
        }
      ).course
      const payment = paymentMap.get(p.courseId)
      return {
        courseId: p.courseId,
        title: course?.title ?? "Unknown",
        level: course?.level ?? null,
        isPremium: course?.isPremium ?? false,
        totalLessons: course?.totalLessons ?? 0,
        progressPercent: p.progressPercent,
        completedLessons: p.completedLessons,
        enrolledAt: p.enrolledAt,
        completedAt: p.completedAt,
        payment: payment ? { status: payment.status, amount: payment.amount } : null,
      }
    })
  }

  // ─── GET /admin/courses/:courseId/students ─────────────────────────────────────

  async getCourseStudents(
    courseId: string,
    page: number,
    limit: number,
  ): Promise<{
    students: {
      userId: string
      email: string
      displayName: string | null
      avatarUrl: string | null
      progressPercent: number
      completedLessons: number
      enrolledAt: Date
      completedAt: Date | null
      payment: { status: string; amount: number } | null
    }[]
    total: number
    page: number
    limit: number
  }> {
    const [progressRows, total] = await this.courseProgressRepo
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.user", "u")
      .where("p.courseId = :courseId", { courseId })
      .orderBy("p.enrolledAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    const userIds = progressRows.map((p) => p.userId)
    const [profiles, payments] =
      userIds.length > 0
        ? await Promise.all([
            this.profileRepo.find({ where: { userId: In(userIds) } }),
            this.paymentRepo.find({ where: { courseId, userId: In(userIds) } }),
          ])
        : [[], []]

    const profileMap = new Map(profiles.map((p) => [p.userId, p]))
    const paymentMap = new Map(payments.map((p) => [p.userId, p]))

    const students = progressRows.map((p) => {
      const user = (p as typeof p & { user?: { email: string } }).user
      const profile = profileMap.get(p.userId)
      const payment = paymentMap.get(p.userId)
      return {
        userId: p.userId,
        email: user?.email ?? "",
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        progressPercent: p.progressPercent,
        completedLessons: p.completedLessons,
        enrolledAt: p.enrolledAt,
        completedAt: p.completedAt,
        payment: payment ? { status: payment.status, amount: payment.amount } : null,
      }
    })

    return { students, total, page, limit }
  }

  // ─── GET /admin/analytics ─────────────────────────────────────────────────────

  async getAnalytics(): Promise<{
    payments: {
      totalRevenue: number
      paidCount: number
      pendingCount: number
      failedCount: number
    }
    topCourses: {
      id: string
      title: string
      enrolledCount: number
      completedCount: number
      completionRate: number
      paidCount: number
    }[]
    userGrowth: {
      month: string
      newUsers: number
    }[]
  }> {
    // Payment aggregates
    const [paidCount, pendingCount, failedCount, revenueResult] = await Promise.all([
      this.paymentRepo.count({ where: { status: PaymentStatus.PAID } }),
      this.paymentRepo.count({ where: { status: PaymentStatus.PENDING } }),
      this.paymentRepo.count({ where: { status: PaymentStatus.FAILED } }),
      this.paymentRepo
        .createQueryBuilder("p")
        .select("SUM(p.amount)", "total")
        .where("p.status = :status", { status: PaymentStatus.PAID })
        .getRawOne<{ total: string }>(),
    ])

    const totalRevenue = revenueResult?.total ? Math.round(Number(revenueResult.total)) : 0

    // Top courses by enrollment (up to 10)
    const courses = await this.courseRepo
      .createQueryBuilder("c")
      .select(["c.id", "c.title"])
      .where("c.isPublished = true")
      .getMany()

    const courseIds = courses.map((c) => c.id)

    const [progressRows, paidRows] =
      courseIds.length > 0
        ? await Promise.all([
            this.courseProgressRepo
              .createQueryBuilder("p")
              .select("p.courseId", "courseId")
              .addSelect("COUNT(*)", "enrolledCount")
              .addSelect(
                "SUM(CASE WHEN p.completedAt IS NOT NULL THEN 1 ELSE 0 END)",
                "completedCount",
              )
              .where("p.courseId IN (:...ids)", { ids: courseIds })
              .groupBy("p.courseId")
              .getRawMany<{ courseId: string; enrolledCount: string; completedCount: string }>(),
            this.paymentRepo
              .createQueryBuilder("p")
              .select("p.courseId", "courseId")
              .addSelect("COUNT(*)", "paidCount")
              .where("p.courseId IN (:...ids)", { ids: courseIds })
              .andWhere("p.status = :status", { status: PaymentStatus.PAID })
              .groupBy("p.courseId")
              .getRawMany<{ courseId: string; paidCount: string }>(),
          ])
        : [[], []]

    const progressMap = new Map(progressRows.map((r) => [r.courseId, r]))
    const paidMap = new Map(paidRows.map((r) => [r.courseId, Number(r.paidCount)]))

    const topCourses = courses
      .map((c) => {
        const p = progressMap.get(c.id)
        const enrolled = p ? Number(p.enrolledCount) : 0
        const completed = p ? Number(p.completedCount) : 0
        return {
          id: c.id,
          title: c.title,
          enrolledCount: enrolled,
          completedCount: completed,
          completionRate: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
          paidCount: paidMap.get(c.id) ?? 0,
        }
      })
      .sort((a, b) => b.enrolledCount - a.enrolledCount)
      .slice(0, 10)

    // Monthly user growth — last 6 months
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    sixMonthsAgo.setDate(1)
    sixMonthsAgo.setHours(0, 0, 0, 0)

    const growthRows = await this.userRepo
      .createQueryBuilder("u")
      .select("TO_CHAR(u.createdAt, 'YYYY-MM')", "month")
      .addSelect("COUNT(*)", "newUsers")
      .where("u.createdAt >= :from", { from: sixMonthsAgo })
      .groupBy("month")
      .orderBy("month", "ASC")
      .getRawMany<{ month: string; newUsers: string }>()

    const userGrowth = growthRows.map((r) => ({ month: r.month, newUsers: Number(r.newUsers) }))

    return {
      payments: { totalRevenue, paidCount, pendingCount, failedCount },
      topCourses,
      userGrowth,
    }
  }

  // ─── POST /admin/notifications ────────────────────────────────────────────────

  async sendNotification(
    target: "all" | "user",
    title: string,
    body: string,
    userIds?: string[],
  ): Promise<{ sent: number }> {
    const dto = { type: NotificationType.SYSTEM, title, body }

    if (target === "user") {
      if (!userIds || !userIds.length)
        throw new ValidationError("userIds is required when target is 'user'")

      // Verify all user IDs exist
      const users = await this.userRepo
        .createQueryBuilder("u")
        .select("u.id")
        .where("u.id IN (:...ids)", { ids: userIds })
        .getMany()

      if (!users.length) throw new NotFoundError("No users found for the given IDs")

      await Promise.allSettled(users.map((u) => this.notificationService.sendToUser(u.id, dto)))
      logger.info(`Admin notification sent to ${users.length} specific user(s)`)
      return { sent: users.length }
    }

    // target === 'all' — fetch all user IDs (lightweight, id only)
    const users = await this.userRepo.find({ select: { id: true } })
    if (!users.length) return { sent: 0 }

    // Send in batches of 50 to avoid overwhelming the system
    const BATCH = 50
    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH)
      await Promise.allSettled(batch.map((u) => this.notificationService.sendToUser(u.id, dto)))
    }

    logger.info(`Admin broadcast notification sent to ${users.length} users`)
    return { sent: users.length }
  }
}
