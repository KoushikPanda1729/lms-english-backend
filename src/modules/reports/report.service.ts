import { Repository } from "typeorm"
import logger from "../../config/logger"
import { RefreshToken } from "../../entities/RefreshToken.entity"
import { Report } from "../../entities/Report.entity"
import { User } from "../../entities/User.entity"
import { ReportReason, ReportStatus } from "../../enums/index"
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors"

interface SubmitReportDto {
  reportedId: string
  sessionId?: string | null
  reason: ReportReason
  description?: string | null
}

interface UpdateReportDto {
  status?: ReportStatus
  adminNote?: string | null
  banReportedUser?: boolean
}

export class ReportService {
  constructor(
    private readonly reportRepo: Repository<Report>,
    private readonly userRepo: Repository<User>,
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  // ─── POST /reports ────────────────────────────────────────────────────────────

  async submitReport(reporterId: string, dto: SubmitReportDto): Promise<Report> {
    if (reporterId === dto.reportedId) {
      throw new ValidationError("You cannot report yourself")
    }

    const reported = await this.userRepo.findOne({ where: { id: dto.reportedId } })
    if (!reported) throw new NotFoundError("Reported user not found")

    // One report per session per reporter
    if (dto.sessionId) {
      const existing = await this.reportRepo.findOne({
        where: { sessionId: dto.sessionId, reporterId },
      })
      if (existing) throw new ConflictError("You have already reported this session")
    }

    const report = this.reportRepo.create({
      reporterId,
      reportedId: dto.reportedId,
      sessionId: dto.sessionId ?? null,
      reason: dto.reason,
      description: dto.description ?? null,
      status: ReportStatus.PENDING,
    })
    await this.reportRepo.save(report)

    // Auto-flag: warn if reported user now has 3+ pending reports
    const pendingCount = await this.reportRepo.count({
      where: { reportedId: dto.reportedId, status: ReportStatus.PENDING },
    })
    if (pendingCount >= 3) {
      logger.warn(
        `User ${dto.reportedId} has ${pendingCount} pending reports — flagged for admin review`,
      )
    }

    return report
  }

  // ─── GET /reports/mine ────────────────────────────────────────────────────────

  async getMyReports(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ reports: Report[]; total: number; page: number; limit: number }> {
    const [reports, total] = await this.reportRepo.findAndCount({
      where: { reporterId: userId },
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    })
    return { reports, total, page, limit }
  }

  // ─── GET /admin/reports ───────────────────────────────────────────────────────

  async getAllReports(
    status: ReportStatus | undefined,
    page: number,
    limit: number,
  ): Promise<{ reports: Report[]; total: number; page: number; limit: number }> {
    const qb = this.reportRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.reporter", "reporter")
      .leftJoin("reporter.profile", "reporterProfile")
      .addSelect(["reporterProfile.displayName", "reporterProfile.avatarUrl"])
      .leftJoinAndSelect("r.reported", "reported")
      .leftJoin("reported.profile", "reportedProfile")
      .addSelect(["reportedProfile.displayName", "reportedProfile.avatarUrl"])
      .orderBy("r.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)

    if (status) {
      qb.where("r.status = :status", { status })
    }

    const [reports, total] = await qb.getManyAndCount()
    return { reports, total, page, limit }
  }

  // ─── PATCH /admin/reports/:id ─────────────────────────────────────────────────

  async updateReport(reportId: string, dto: UpdateReportDto): Promise<Report> {
    const report = await this.reportRepo.findOne({ where: { id: reportId } })
    if (!report) throw new NotFoundError("Report not found")

    if (dto.status) {
      report.status = dto.status
      // Set actioned_at when moving to a terminal status
      if (dto.status === ReportStatus.ACTIONED || dto.status === ReportStatus.DISMISSED) {
        report.actionedAt = new Date()
      }
    }

    if (dto.adminNote !== undefined) {
      report.adminNote = dto.adminNote
    }

    await this.reportRepo.save(report)

    // Ban the reported user if requested
    if (dto.banReportedUser) {
      await this.banUser(report.reportedId)
      logger.info(`User ${report.reportedId} banned via report ${reportId}`)
    }

    return report
  }

  // ─── Private: ban user + revoke all refresh tokens ───────────────────────────

  private async banUser(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) return

    user.isBanned = true
    await this.userRepo.save(user)

    // Revoke all active refresh tokens — forces logout on all devices
    await this.refreshTokenRepo.update(
      { userId, revoked: false },
      { revoked: true, revokedAt: new Date() },
    )
  }
}
