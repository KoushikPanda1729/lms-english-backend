import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { AdminService } from "./admin.service"
import { UserRole } from "../../enums/index"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isBanned: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  role: z.nativeEnum(UserRole).optional(),
})

const banSchema = z.object({
  banned: z.boolean(),
})

const sendNotificationSchema = z.object({
  target: z.enum(["all", "user"]),
  userIds: z.array(z.string().uuid()).optional(),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(300),
})

const roleSchema = z.object({
  role: z.nativeEnum(UserRole),
})

export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── GET /admin/users ─────────────────────────────────────────────────────────

  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = listUsersSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.adminService.listUsers(parsed.data)
      res.json(success(result, "Users fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /admin/users/:id ─────────────────────────────────────────────────────

  async getUserDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid user ID")

      const result = await this.adminService.getUserDetail(id)
      res.json(success(result, "User detail fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── PATCH /admin/users/:id/ban ───────────────────────────────────────────────

  async setUserBanned(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid user ID")
      if (id === req.user!.id) throw new ValidationError("Cannot ban yourself")

      const parsed = banSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const user = await this.adminService.setUserBanned(id, parsed.data.banned)
      const msg = parsed.data.banned ? "User banned" : "User unbanned"
      res.json(success(user, msg))
    } catch (err) {
      next(err)
    }
  }

  // ─── PATCH /admin/users/:id/role ──────────────────────────────────────────────

  async setUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid user ID")
      if (id === req.user!.id) throw new ValidationError("Cannot change your own role")

      const parsed = roleSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const user = await this.adminService.setUserRole(id, parsed.data.role)
      res.json(success(user, "User role updated"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /admin/stats ─────────────────────────────────────────────────────────

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await this.adminService.getStats()
      res.json(success(stats, "Stats fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /admin/analytics ─────────────────────────────────────────────────────

  async getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const analytics = await this.adminService.getAnalytics()
      res.json(success(analytics, "Analytics fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /admin/notifications ────────────────────────────────────────────────

  async sendNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = sendNotificationSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const { target, userIds, title, body } = parsed.data
      const result = await this.adminService.sendNotification(target, title, body, userIds)
      res.json(success(result, `Notification sent to ${result.sent} user(s)`))
    } catch (err) {
      next(err)
    }
  }
}
