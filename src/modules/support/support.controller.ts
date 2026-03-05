import type { Request, Response, NextFunction } from "express"
import { SupportService } from "./support.service"

export class SupportController {
  constructor(private supportService: SupportService) {}

  // GET /admin/support/conversations
  async listConversations(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await this.supportService.listConversations()
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  }

  // GET /admin/support/conversations/:userId
  async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = String(req.params.userId)
      const data = await this.supportService.getMessagesForUser(userId)
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  }

  // GET /admin/support/unread
  async getTotalUnread(_req: Request, res: Response, next: NextFunction) {
    try {
      const count = await this.supportService.getTotalUnreadCount()
      res.json({ success: true, data: { count } })
    } catch (err) {
      next(err)
    }
  }

  // PATCH /admin/support/conversations/:userId/read
  async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = String(req.params.userId)
      await this.supportService.markMessagesRead(userId)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }

  // POST /support/contact (no auth — for banned users)
  async guestContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, message } = req.body ?? {}
      if (!email || typeof email !== "string" || !message || typeof message !== "string") {
        res
          .status(400)
          .json({ success: false, error: { message: "email and message are required" } })
        return
      }
      const trimmedEmail = email.trim().toLowerCase()
      const trimmedText = message.trim()
      if (!trimmedEmail || !trimmedText || trimmedText.length > 2000) {
        res.status(400).json({ success: false, error: { message: "Invalid input" } })
        return
      }
      await this.supportService.saveGuestMessage(trimmedEmail, trimmedText)
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
}
