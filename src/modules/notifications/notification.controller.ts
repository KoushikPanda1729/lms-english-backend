import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { NotificationService } from "./notification.service"
import { AdminActivityService } from "./admin-activity.service"
import { Platform } from "../../enums/index"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const registerDeviceSchema = z.object({
  fcmToken: z.string().min(1, "fcmToken is required"),
  deviceId: z.string().min(1, "deviceId is required"),
  platform: z.enum([Platform.IOS, Platform.ANDROID]),
})

const unregisterDeviceSchema = z.object({
  deviceId: z.string().min(1, "deviceId is required"),
})

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly adminActivityService?: AdminActivityService,
  ) {}

  // ─── POST /notifications/device ───────────────────────────────────────────────

  async registerDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerDeviceSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      await this.notificationService.registerDevice(req.user!.id, parsed.data)
      res.json(success(null, "Device registered"))
    } catch (err) {
      next(err)
    }
  }

  // ─── DELETE /notifications/device ─────────────────────────────────────────────

  async unregisterDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = unregisterDeviceSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      await this.notificationService.unregisterDevice(req.user!.id, parsed.data.deviceId)
      res.json(success(null, "Device unregistered"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /notifications ───────────────────────────────────────────────────────

  async getMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.notificationService.getMyNotifications(
        req.user!.id,
        parsed.data.page,
        parsed.data.limit,
      )
      res.json(success(result, "Notifications fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── PATCH /notifications/:id/read ────────────────────────────────────────────

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid notification ID")

      const notification = await this.notificationService.markAsRead(id, req.user!.id)
      res.json(success(notification, "Marked as read"))
    } catch (err) {
      next(err)
    }
  }

  // ─── PATCH /notifications/read-all ────────────────────────────────────────────

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.notificationService.markAllAsRead(req.user!.id)
      res.json(success(null, "All notifications marked as read"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /notifications/unread-count ──────────────────────────────────────────

  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await this.notificationService.getUnreadCount(req.user!.id)
      res.json(success({ count }, "Unread count fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /admin/notifications ─────────────────────────────────────────────────

  async adminSendNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schema = z.object({
        target: z.enum(["all", "user"]),
        userIds: z.array(z.string().uuid()).optional(),
        title: z.string().min(1).max(100),
        body: z.string().min(1).max(300),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.notificationService.sendBroadcast(parsed.data)
      res.json(success(result, `Notification sent to ${result.sent} user(s)`))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /admin/notifications ──────────────────────────────────────────────────

  async adminListNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.notificationService.listAdminBroadcasts(
        parsed.data.page,
        parsed.data.limit,
      )
      res.json(success(result, "Broadcast history fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── DELETE /admin/notifications ───────────────────────────────────────────────

  async adminDeleteBroadcast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schema = z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        sentAt: z.string().min(1),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      await this.notificationService.deleteAdminBroadcast(
        parsed.data.title,
        parsed.data.body,
        parsed.data.sentAt,
      )
      res.json(success(null, "Broadcast deleted"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /admin/activity ──────────────────────────────────────────────────────

  async getAdminActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.adminActivityService!.getRecent(30)
      res.json(success(result, "Admin activity fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── PATCH /admin/activity/:id/seen ──────────────────────────────────────────

  async markAdminActivityItemSeen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid activity ID")
      await this.adminActivityService!.markSeen(id)
      res.json(success(null, "Marked as seen"))
    } catch (err) {
      next(err)
    }
  }

  // ─── PATCH /admin/activity/seen ───────────────────────────────────────────────

  async markAdminActivitySeen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.adminActivityService!.markAllSeen()
      res.json(success(null, "Marked as seen"))
    } catch (err) {
      next(err)
    }
  }
}
