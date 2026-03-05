import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { SessionService } from "./session.service"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const rateSchema = z.object({
  stars: z.number().int().min(1, "Minimum 1 star").max(5, "Maximum 5 stars"),
  feedback: z.string().max(500).optional().nullable(),
})

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const adminSessionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().optional(),
  level: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  async getMyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = historyQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.sessionService.getMyHistory(
        req.user!.id,
        parsed.data.page,
        parsed.data.limit,
      )
      res.json(success(result, "Sessions fetched"))
    } catch (err) {
      next(err)
    }
  }

  async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid session ID")

      const session = await this.sessionService.getSession(id, req.user!.id)
      res.json(success(session, "Session fetched"))
    } catch (err) {
      next(err)
    }
  }

  async rateSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid session ID")

      const parsed = rateSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      await this.sessionService.rateSession(
        id,
        req.user!.id,
        parsed.data.stars,
        parsed.data.feedback,
      )
      res.json(success(null, "Rating submitted"))
    } catch (err) {
      next(err)
    }
  }

  async getSessionByRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomId = String(req.params.roomId)
      const session = await this.sessionService.getSessionByRoom(roomId, req.user!.id)
      res.json(success(session, "Session fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: GET /admin/sessions ───────────────────────────────────────────────

  async adminListSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = adminSessionQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.sessionService.listSessionsAdmin(parsed.data)
      res.json(success(result, "Sessions fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: GET /admin/sessions/:id ──────────────────────────────────────────

  async adminGetSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid session ID")

      const session = await this.sessionService.getSessionAdmin(id)
      res.json(success(session, "Session fetched"))
    } catch (err) {
      next(err)
    }
  }
}
