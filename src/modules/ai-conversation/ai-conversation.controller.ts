import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import path from "path"
import { AIConversationService } from "./ai-conversation.service"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"
import { StorageService } from "../../services/storage.service"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const listPersonasAdminSchema = paginationSchema.extend({
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  isPremium: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
})

const createPersonaSchema = z.object({
  name: z.string().min(1).max(100),
  avatar: z.string().min(1).max(10),
  expertise: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  systemPrompt: z.string().min(1),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  isPremium: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
})

const updatePersonaSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().min(1).max(10).optional(),
  expertise: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  systemPrompt: z.string().min(1).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  isPremium: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export class AIConversationController {
  constructor(
    private readonly service: AIConversationService,
    private readonly storage: StorageService,
  ) {}

  // ─── Admin: Seed personas ────────────────────────────────────────────────────

  async seedPersonas(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.seedDefaultPersonas()
      res.json(success(result, "Personas seeded"))
    } catch (err) {
      next(err)
    }
  }

  // ─── Admin: List personas ────────────────────────────────────────────────────

  async listPersonasAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = listPersonasAdminSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.service.listPersonasAdmin({
        page: parsed.data.page,
        limit: parsed.data.limit,
        isActive: parsed.data.isActive,
        difficulty: parsed.data.difficulty,
        isPremium: parsed.data.isPremium,
      })
      res.json(success(result, "Personas fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── Admin: Get persona ──────────────────────────────────────────────────────

  async getPersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid persona ID")

      const result = await this.service.getPersonaById(id)
      res.json(success(result, "Persona fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── Admin: Create persona ───────────────────────────────────────────────────

  async createPersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createPersonaSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.service.createPersona(parsed.data)
      res.status(201).json(success(result, "Persona created"))
    } catch (err) {
      next(err)
    }
  }

  // ─── Admin: Update persona ───────────────────────────────────────────────────

  async updatePersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid persona ID")

      const parsed = updatePersonaSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.service.updatePersona(id, parsed.data)
      res.json(success(result, "Persona updated"))
    } catch (err) {
      next(err)
    }
  }

  // ─── Admin: Delete persona ───────────────────────────────────────────────────

  async deletePersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid persona ID")

      await this.service.deletePersona(id)
      res.json(success(null, "Persona deleted"))
    } catch (err) {
      next(err)
    }
  }

  // ─── Admin: Upload avatar image ───────────────────────────────────────────────

  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid persona ID")

      const file = req.file
      if (!file) throw new ValidationError("No file uploaded")

      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"]
      if (!allowed.includes(file.mimetype))
        throw new ValidationError("Only JPEG, PNG, WebP or GIF images allowed")

      const ext = path.extname(file.originalname).toLowerCase() || ".jpg"
      const key = `ai-personas/${id}/avatar${ext}`
      const url = await this.storage.upload(key, file.buffer, file.mimetype)

      const persona = await this.service.updatePersona(id, { avatar: url })
      res.json(success(persona, "Avatar uploaded"))
    } catch (err) {
      next(err)
    }
  }

  // ─── Admin: Stats ────────────────────────────────────────────────────────────

  async getAdminStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getAdminStats()
      res.json(success(result, "Stats fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── User: List personas ─────────────────────────────────────────────────────

  async listPersonas(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.listPersonasForUser()
      res.json(success(result, "Personas fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── User: Text chat message ─────────────────────────────────────────────────

  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = z
        .object({
          personaId: z.string().uuid(),
          messages: z
            .array(z.object({ role: z.enum(["user", "model"]), text: z.string().min(1) }))
            .min(1),
        })
        .safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const reply = await this.service.chat(parsed.data.personaId, parsed.data.messages)
      res.json(success({ reply }, "Message sent"))
    } catch (err) {
      next(err)
    }
  }

  // ─── User: Start session ─────────────────────────────────────────────────────

  async startSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id
      const personaId = String(req.params.personaId)
      if (!uuidRegex.test(personaId)) throw new ValidationError("Invalid persona ID")

      const result = await this.service.startSession(userId, personaId)
      res.status(201).json(success(result, "Session started"))
    } catch (err) {
      next(err)
    }
  }

  // ─── User: End session ───────────────────────────────────────────────────────

  async endSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id
      const sessionId = String(req.params.sessionId)
      if (!uuidRegex.test(sessionId)) throw new ValidationError("Invalid session ID")

      const result = await this.service.endSession(sessionId, userId)
      res.json(success(result, "Session ended"))
    } catch (err) {
      next(err)
    }
  }

  // ─── User: Session history ───────────────────────────────────────────────────

  async getMyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id
      const parsed = paginationSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.service.getMyHistory(userId, parsed.data.page, parsed.data.limit)
      res.json(success(result, "History fetched"))
    } catch (err) {
      next(err)
    }
  }
}
