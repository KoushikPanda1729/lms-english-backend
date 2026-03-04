import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { CourseService } from "./course.service"
import { QuizService } from "./quiz.service"
import { EnglishLevel, LessonType } from "../../enums/index"
import { QuestionType } from "../../entities/QuizQuestion.entity"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const listCoursesSchema = paginationSchema.extend({
  level: z.nativeEnum(EnglishLevel).optional(),
  isPremium: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
})

const createCourseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  level: z.nativeEnum(EnglishLevel).nullable().optional(),
  isPremium: z.boolean().optional(),
  price: z.number().int().min(0).optional(), // smallest currency unit (paise/cents)
})

const updateCourseSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  level: z.nativeEnum(EnglishLevel).nullable().optional(),
  isPremium: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  price: z.number().int().min(0).optional(), // smallest currency unit (paise/cents)
})

const createLessonSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.nativeEnum(LessonType),
  content: z.string().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  order: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
})

const updateLessonSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.nativeEnum(LessonType).optional(),
  content: z.string().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  order: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
})

const createQuizSchema = z.object({
  title: z.string().min(1, "Title is required"),
  passingScore: z.number().int().min(1).max(100).optional(),
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        type: z.nativeEnum(QuestionType),
        order: z.number().int().min(0).optional(),
        options: z
          .array(
            z.object({
              text: z.string().min(1),
              isCorrect: z.boolean(),
            }),
          )
          .min(2, "Each question needs at least 2 options"),
      }),
    )
    .min(1, "Quiz must have at least one question"),
})

const updateQuizSchema = z.object({
  title: z.string().min(1).optional(),
  passingScore: z.number().int().min(1).max(100).optional(),
})

const submitQuizSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedOptionIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(1),
})

export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly quizService: QuizService,
  ) {}

  private validateUuid(id: string, label = "ID"): void {
    if (!uuidRegex.test(id)) throw new ValidationError(`Invalid ${label}`)
  }

  // ─── GET /admin/courses/:id/lessons ──────────────────────────────────────────

  async adminListLessons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      this.validateUuid(String(req.params.id), "course ID")
      const lessons = await this.courseService.listLessons(String(req.params.id))
      res.json(success(lessons, "Lessons fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /admin/courses ───────────────────────────────────────────────────────

  async adminListCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = listCoursesSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.courseService.listCourses(parsed.data, { adminMode: true })
      res.json(success(result, "Courses fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /courses ─────────────────────────────────────────────────────────────

  async listCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = listCoursesSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.courseService.listCourses(parsed.data, { userId: req.user?.id })
      res.json(success(result, "Courses fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /courses/my ──────────────────────────────────────────────────────────

  async getMyCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.courseService.getMyCourses(
        req.user!.id,
        parsed.data.page,
        parsed.data.limit,
      )
      res.json(success(result, "My courses fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /courses/:id ─────────────────────────────────────────────────────────

  async getCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      this.validateUuid(id, "course ID")
      const result = await this.courseService.getCourse(id, req.user?.id)
      res.json(success(result, "Course fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /courses/:id/enroll ─────────────────────────────────────────────────

  async enroll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      this.validateUuid(id, "course ID")
      const result = await this.courseService.enroll(id, req.user!.id)
      res.status(201).json(success(result, "Enrolled successfully"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /courses/:id/lessons/:lessonId ───────────────────────────────────────

  async getLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const result = await this.courseService.getLesson(id, lessonId, req.user!.id)
      res.json(success(result, "Lesson fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /courses/:id/lessons/:lessonId/stream ────────────────────────────────

  async getLessonStream(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const m3u8 = await this.courseService.getLessonStream(id, lessonId, req.user!.id)
      res.setHeader("Content-Type", "application/x-mpegURL")
      res.setHeader("Cache-Control", "no-store")
      res.send(m3u8)
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /courses/:id/lessons/:lessonId/complete ─────────────────────────────

  async completeLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const result = await this.courseService.completeLesson(id, lessonId, req.user!.id)
      res.json(success(result, "Lesson marked as complete"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /courses/:id/lessons/:lessonId/quiz ──────────────────────────────────

  async getQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const result = await this.quizService.getQuiz(id, lessonId, { userId: req.user!.id })
      res.json(success(result, "Quiz fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /courses/:id/lessons/:lessonId/quiz/submit ─────────────────────────

  async submitQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const parsed = submitQuizSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.quizService.submitQuiz(id, lessonId, req.user!.id, parsed.data)
      res.json(
        success(
          result,
          `Quiz submitted — score: ${result.score}%${result.passed ? " ✓ Passed" : " ✗ Failed"}`,
        ),
      )
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: POST /admin/courses ───────────────────────────────────────────────

  async adminCreateCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createCourseSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.courseService.createCourse(parsed.data)
      res.status(201).json(success(result, "Course created"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: PATCH /admin/courses/:id ─────────────────────────────────────────

  async adminUpdateCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      this.validateUuid(id, "course ID")
      const parsed = updateCourseSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.courseService.updateCourse(id, parsed.data)
      res.json(success(result, "Course updated"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: POST /admin/courses/:id/thumbnail ────────────────────────────────

  async adminUploadThumbnail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      this.validateUuid(id, "course ID")
      if (!req.file) throw new ValidationError("No file uploaded")

      const result = await this.courseService.uploadThumbnail(id, req.file)
      res.json(success(result, "Thumbnail uploaded"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: POST /admin/courses/:id/lessons ───────────────────────────────────

  async adminCreateLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      this.validateUuid(id, "course ID")
      const parsed = createLessonSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.courseService.createLesson(id, parsed.data)
      res.status(201).json(success(result, "Lesson created"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: PATCH /admin/courses/:id/lessons/:lessonId ───────────────────────

  async adminUpdateLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const parsed = updateLessonSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.courseService.updateLesson(id, lessonId, parsed.data)
      res.json(success(result, "Lesson updated"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: POST /admin/courses/:id/lessons/:lessonId/pdf ────────────────────

  async adminUploadLessonPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      if (!req.file) throw new ValidationError("No file uploaded")

      const result = await this.courseService.uploadLessonPdf(id, lessonId, req.file)
      res.json(success(result, "PDF uploaded"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: POST /admin/courses/:id/lessons/:lessonId/video ──────────────────

  async adminUploadVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      if (!req.file) throw new ValidationError("No file uploaded")

      const result = await this.courseService.uploadLessonVideo(id, lessonId, req.file)
      res.json(success(result, "Video uploaded"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: DELETE /admin/courses/:id ────────────────────────────────────────

  async adminDeleteCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      this.validateUuid(id, "course ID")
      await this.courseService.deleteCourse(id)
      res.json(success(null, "Course deleted"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: DELETE /admin/courses/:id/lessons/:lessonId ──────────────────────

  async adminDeleteLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      await this.courseService.deleteLesson(id, lessonId)
      res.json(success(null, "Lesson deleted"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: GET /admin/courses/:id/lessons/:lessonId/quiz ────────────────────

  async adminGetQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const quiz = await this.quizService.getQuiz(id, lessonId, { adminMode: true })
      res.json(success(quiz, "Quiz fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: POST /admin/courses/:id/lessons/:lessonId/quiz ───────────────────

  async adminCreateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const parsed = createQuizSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.quizService.createQuiz(id, lessonId, parsed.data)
      res.status(201).json(success(result, "Quiz created"))
    } catch (err) {
      next(err)
    }
  }

  // ─── ADMIN: PATCH /admin/courses/:id/lessons/:lessonId/quiz ──────────────────

  async adminUpdateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id)
      const lessonId = String(req.params.lessonId)
      this.validateUuid(id, "course ID")
      this.validateUuid(lessonId, "lesson ID")
      const parsed = updateQuizSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.quizService.updateQuiz(id, lessonId, parsed.data)
      res.json(success(result, "Quiz updated"))
    } catch (err) {
      next(err)
    }
  }
}
