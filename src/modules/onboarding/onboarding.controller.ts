import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { OnboardingService } from "./onboarding.service"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"
import { EnglishLevel } from "../../enums/index"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const completeSchema = z.object({
  displayName: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  nativeLanguage: z.string().min(1).max(100),
  learningGoal: z.string().min(1),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedIndex: z.number().int().min(0),
      }),
    )
    .default([]),
})

const createQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  levelTag: z.nativeEnum(EnglishLevel),
  sortOrder: z.number().int().min(0).optional(),
})

const updateQuestionSchema = z.object({
  question: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).min(2).max(6).optional(),
  correctIndex: z.number().int().min(0).optional(),
  levelTag: z.nativeEnum(EnglishLevel).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // ─── GET /onboarding/questions ─────────────────────────────────────────────

  async getQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const questions = await this.onboardingService.getActiveQuestions()
      res.json(success(questions, "Questions fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /onboarding/complete ─────────────────────────────────────────────

  async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as Request & { user?: { id: string } }).user!.id
      const parsed = completeSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.onboardingService.complete(userId, parsed.data)
      res.json(success(result, "Onboarding completed"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /admin/onboarding/questions ──────────────────────────────────────

  async adminList(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const questions = await this.onboardingService.adminList()
      res.json(success(questions, "Questions fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /admin/onboarding/questions ─────────────────────────────────────

  async adminCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createQuestionSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.onboardingService.adminCreate(parsed.data)
      res.status(201).json(success(result, "Question created"))
    } catch (err) {
      next(err)
    }
  }

  // ─── PATCH /admin/onboarding/questions/:id ─────────────────────────────────

  async adminUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid question ID")

      const parsed = updateQuestionSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.onboardingService.adminUpdate(id, parsed.data)
      res.json(success(result, "Question updated"))
    } catch (err) {
      next(err)
    }
  }

  // ─── DELETE /admin/onboarding/questions/:id ────────────────────────────────

  async adminDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      if (!uuidRegex.test(id)) throw new ValidationError("Invalid question ID")

      await this.onboardingService.adminDelete(id)
      res.json(success(null, "Question deleted"))
    } catch (err) {
      next(err)
    }
  }
}
