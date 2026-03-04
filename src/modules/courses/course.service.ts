import { Repository } from "typeorm"
import { Course } from "../../entities/Course.entity"
import { Lesson } from "../../entities/Lesson.entity"
import { UserCourseProgress } from "../../entities/UserCourseProgress.entity"
import { UserLessonProgress } from "../../entities/UserLessonProgress.entity"
import { EnglishLevel, LessonType } from "../../enums/index"
import { NotFoundError, ForbiddenError, ConflictError } from "../../shared/errors"
import { StorageService } from "../../services/storage.service"
import { HlsService } from "../../services/hls.service"
import { Config } from "../../config/config"

interface ListCoursesFilters {
  level?: EnglishLevel
  isPremium?: boolean
  page: number
  limit: number
}

interface CreateCourseDto {
  title: string
  description?: string | null
  level?: EnglishLevel | null
  isPremium?: boolean
  price?: number
}

interface UpdateCourseDto {
  title?: string
  description?: string | null
  thumbnailUrl?: string | null
  level?: EnglishLevel | null
  isPremium?: boolean
  isPublished?: boolean
  price?: number
}

interface CreateLessonDto {
  title: string
  type: LessonType
  content?: string | null
  videoUrl?: string | null
  order?: number
  durationMinutes?: number | null
}

interface UpdateLessonDto {
  title?: string
  type?: LessonType
  content?: string | null
  videoUrl?: string | null
  order?: number
  durationMinutes?: number | null
}

export class CourseService {
  constructor(
    private readonly courseRepo: Repository<Course>,
    private readonly lessonRepo: Repository<Lesson>,
    private readonly courseProgressRepo: Repository<UserCourseProgress>,
    private readonly lessonProgressRepo: Repository<UserLessonProgress>,
    private readonly storageService: StorageService,
    private readonly hlsService: HlsService,
  ) {}

  // ─── GET /courses  (public) · GET /admin/courses (admin) ─────────────────────
  // adminMode = true  → include unpublished, skip enrollment lookup
  // adminMode = false → published only, attach enrolled flag per userId

  async listCourses(
    filters: ListCoursesFilters,
    options: { adminMode?: boolean; userId?: string } = {},
  ): Promise<{ courses: Course[]; total: number; page: number; limit: number }> {
    const { page, limit, level, isPremium } = filters
    const { adminMode = false, userId } = options

    const qb = this.courseRepo
      .createQueryBuilder("c")
      .orderBy("c.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)

    if (!adminMode) qb.where("c.isPublished = true")
    if (level) qb.andWhere("c.level = :level", { level })
    if (isPremium !== undefined) qb.andWhere("c.isPremium = :isPremium", { isPremium })

    const [courses, total] = await qb.getManyAndCount()

    if (!adminMode && courses.length > 0) {
      if (userId) {
        const enrollments = await this.courseProgressRepo.find({
          where: courses.map((c) => ({ userId, courseId: c.id })),
        })
        const enrollmentMap = new Map(enrollments.map((e) => [e.courseId, e]))
        courses.forEach((c) => Object.assign(c, { enrollment: enrollmentMap.get(c.id) ?? null }))
      } else {
        courses.forEach((c) => Object.assign(c, { enrollment: null }))
      }
    }

    courses.forEach((c) => {
      c.thumbnailUrl = this.storageService.signIfNeeded(c.thumbnailUrl)
    })

    return { courses, total, page, limit }
  }

  // ─── GET /courses/my ──────────────────────────────────────────────────────────

  async getMyCourses(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ enrollments: UserCourseProgress[]; total: number; page: number; limit: number }> {
    const [enrollments, total] = await this.courseProgressRepo.findAndCount({
      where: { userId },
      relations: ["course"],
      order: { enrolledAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    })
    return { enrollments, total, page, limit }
  }

  // ─── GET /courses/:id ─────────────────────────────────────────────────────────

  async getCourse(
    courseId: string,
    userId?: string,
  ): Promise<
    Course & { lessons: Lesson[]; enrolled: boolean; enrollment: UserCourseProgress | null }
  > {
    const course = await this.courseRepo.findOne({ where: { id: courseId, isPublished: true } })
    if (!course) throw new NotFoundError("Course not found")

    const lessons = await this.lessonRepo.find({
      where: { courseId },
      order: { order: "ASC" },
    })

    let enrolled = false
    let progress: UserCourseProgress | null = null

    if (userId) {
      progress = (await this.courseProgressRepo.findOne({ where: { userId, courseId } })) ?? null
      enrolled = progress !== null
    }

    course.thumbnailUrl = this.storageService.signIfNeeded(course.thumbnailUrl)
    lessons.forEach((l) => {
      l.pdfUrl = this.storageService.signIfNeeded(l.pdfUrl)
    })
    return Object.assign(course, { lessons, enrolled, enrollment: progress })
  }

  // ─── POST /courses/:id/enroll ─────────────────────────────────────────────────

  async enroll(courseId: string, userId: string): Promise<UserCourseProgress> {
    const course = await this.courseRepo.findOne({ where: { id: courseId, isPublished: true } })
    if (!course) throw new NotFoundError("Course not found")

    const existing = await this.courseProgressRepo.findOne({ where: { userId, courseId } })
    if (existing) throw new ConflictError("Already enrolled in this course")

    const progress = this.courseProgressRepo.create({
      userId,
      courseId,
      completedLessons: 0,
      progressPercent: 0,
    })
    return this.courseProgressRepo.save(progress)
  }

  // ─── GET /courses/:id/lessons/:lessonId ───────────────────────────────────────

  async getLesson(
    courseId: string,
    lessonId: string,
    userId: string,
  ): Promise<Lesson & { completed: boolean }> {
    const course = await this.courseRepo.findOne({ where: { id: courseId, isPublished: true } })
    if (!course) throw new NotFoundError("Course not found")

    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId, courseId } })
    if (!lesson) throw new NotFoundError("Lesson not found")

    if (course.isPremium) {
      const enrollment = await this.courseProgressRepo.findOne({ where: { userId, courseId } })
      if (!enrollment) throw new ForbiddenError("Enroll in this course to access lessons")
    }

    const done = await this.lessonProgressRepo.findOne({ where: { userId, lessonId } })
    const result = Object.assign(lesson, { completed: done !== null })

    if (lesson.hlsPath) {
      // HLS: return stream endpoint URL (serves signed m3u8)
      result.videoUrl = `${Config.APP_URL}/courses/${courseId}/lessons/${lessonId}/stream`
    } else {
      // Direct video or YouTube: sign if CloudFront
      result.videoUrl = this.storageService.signIfNeeded(lesson.videoUrl, 900)
    }

    result.pdfUrl = this.storageService.signIfNeeded(lesson.pdfUrl)

    return result
  }

  // ─── GET /courses/:id/lessons/:lessonId/stream ────────────────────────────────

  async getLessonStream(courseId: string, lessonId: string, userId: string): Promise<string> {
    const course = await this.courseRepo.findOne({ where: { id: courseId, isPublished: true } })
    if (!course) throw new NotFoundError("Course not found")

    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId, courseId } })
    if (!lesson || !lesson.hlsPath) throw new NotFoundError("HLS stream not found for this lesson")

    if (course.isPremium) {
      const enrollment = await this.courseProgressRepo.findOne({ where: { userId, courseId } })
      if (!enrollment) throw new ForbiddenError("Enroll in this course to access lessons")
    }

    return this.hlsService.buildSignedM3u8(lesson.hlsPath)
  }

  // ─── POST /courses/:id/lessons/:lessonId/complete ─────────────────────────────
  // Used for video / pdf / text lessons. Quiz completion happens via quiz submission.

  async completeLesson(
    courseId: string,
    lessonId: string,
    userId: string,
  ): Promise<UserCourseProgress> {
    const course = await this.courseRepo.findOne({ where: { id: courseId, isPublished: true } })
    if (!course) throw new NotFoundError("Course not found")

    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId, courseId } })
    if (!lesson) throw new NotFoundError("Lesson not found")

    if (lesson.type === LessonType.QUIZ) {
      throw new ForbiddenError("Quiz lessons are completed by submitting the quiz")
    }

    const enrollment = await this.courseProgressRepo.findOne({ where: { userId, courseId } })
    if (!enrollment) throw new ForbiddenError("Enroll in this course first")

    return this.markLessonDone(lessonId, userId, enrollment, course)
  }

  // ─── Shared: mark lesson done + update course progress ────────────────────────

  async markLessonDone(
    lessonId: string,
    userId: string,
    enrollment: UserCourseProgress,
    course: Course,
  ): Promise<UserCourseProgress> {
    const existing = await this.lessonProgressRepo.findOne({ where: { userId, lessonId } })
    if (existing) return enrollment // already completed — idempotent

    await this.lessonProgressRepo.save(this.lessonProgressRepo.create({ userId, lessonId }))

    enrollment.completedLessons += 1
    if (course.totalLessons > 0) {
      enrollment.progressPercent = Math.round(
        (enrollment.completedLessons / course.totalLessons) * 100,
      )
    }
    if (enrollment.completedLessons >= course.totalLessons && course.totalLessons > 0) {
      enrollment.completedAt = new Date()
    }

    return this.courseProgressRepo.save(enrollment)
  }

  // ─── ADMIN: Create course ─────────────────────────────────────────────────────

  async createCourse(dto: CreateCourseDto): Promise<Course> {
    const course = this.courseRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      level: dto.level ?? null,
      isPremium: dto.isPremium ?? false,
      price: dto.price ?? 0,
      isPublished: false,
      totalLessons: 0,
    })
    return this.courseRepo.save(course)
  }

  // ─── ADMIN: Update course ─────────────────────────────────────────────────────

  async updateCourse(courseId: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.courseRepo.findOne({ where: { id: courseId } })
    if (!course) throw new NotFoundError("Course not found")

    if (dto.title !== undefined) course.title = dto.title
    if (dto.description !== undefined) course.description = dto.description
    if (dto.thumbnailUrl !== undefined) course.thumbnailUrl = dto.thumbnailUrl
    if (dto.level !== undefined) course.level = dto.level
    if (dto.isPremium !== undefined) course.isPremium = dto.isPremium
    if (dto.isPublished !== undefined) course.isPublished = dto.isPublished
    if (dto.price !== undefined) course.price = dto.price

    return this.courseRepo.save(course)
  }

  // ─── ADMIN: Upload course thumbnail ──────────────────────────────────────────

  async uploadThumbnail(courseId: string, file: Express.Multer.File): Promise<Course> {
    const course = await this.courseRepo.findOne({ where: { id: courseId } })
    if (!course) throw new NotFoundError("Course not found")

    if (course.thumbnailUrl) {
      await this.storageService
        .delete(this.storageService.extractKey(course.thumbnailUrl))
        .catch(() => null)
    }

    const key = `courses/${courseId}/thumbnail-${Date.now()}`
    const url = await this.storageService.upload(key, file.buffer, file.mimetype)
    course.thumbnailUrl = url
    return this.courseRepo.save(course)
  }

  // ─── ADMIN: List lessons for a course ────────────────────────────────────────

  async listLessons(courseId: string): Promise<Lesson[]> {
    const course = await this.courseRepo.findOne({ where: { id: courseId } })
    if (!course) throw new NotFoundError("Course not found")
    return this.lessonRepo.find({ where: { courseId }, order: { order: "ASC" } })
  }

  // ─── ADMIN: Create lesson ─────────────────────────────────────────────────────

  async createLesson(courseId: string, dto: CreateLessonDto): Promise<Lesson> {
    const course = await this.courseRepo.findOne({ where: { id: courseId } })
    if (!course) throw new NotFoundError("Course not found")

    const lesson = this.lessonRepo.create({
      courseId,
      title: dto.title,
      type: dto.type,
      content: dto.content ?? null,
      videoUrl: dto.videoUrl ?? null,
      order: dto.order ?? 0,
      durationMinutes: dto.durationMinutes ?? null,
    })
    const saved = await this.lessonRepo.save(lesson)

    course.totalLessons += 1
    await this.courseRepo.save(course)

    return saved
  }

  // ─── ADMIN: Update lesson ─────────────────────────────────────────────────────

  async updateLesson(courseId: string, lessonId: string, dto: UpdateLessonDto): Promise<Lesson> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId, courseId } })
    if (!lesson) throw new NotFoundError("Lesson not found")

    if (dto.title !== undefined) lesson.title = dto.title
    if (dto.type !== undefined) lesson.type = dto.type
    if (dto.content !== undefined) lesson.content = dto.content
    if (dto.videoUrl !== undefined) lesson.videoUrl = dto.videoUrl
    if (dto.order !== undefined) lesson.order = dto.order
    if (dto.durationMinutes !== undefined) lesson.durationMinutes = dto.durationMinutes

    return this.lessonRepo.save(lesson)
  }

  // ─── ADMIN: Upload lesson PDF ─────────────────────────────────────────────────

  async uploadLessonPdf(
    courseId: string,
    lessonId: string,
    file: Express.Multer.File,
  ): Promise<Lesson> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId, courseId } })
    if (!lesson) throw new NotFoundError("Lesson not found")

    if (lesson.pdfUrl) {
      await this.storageService
        .delete(this.storageService.extractKey(lesson.pdfUrl))
        .catch(() => null)
    }

    const key = `courses/${courseId}/lessons/${lessonId}/pdf-${Date.now()}.pdf`
    const url = await this.storageService.upload(key, file.buffer, file.mimetype)
    lesson.pdfUrl = url
    lesson.type = LessonType.PDF
    return this.lessonRepo.save(lesson)
  }

  // ─── ADMIN: Upload lesson video ───────────────────────────────────────────────

  async uploadLessonVideo(
    courseId: string,
    lessonId: string,
    file: Express.Multer.File,
  ): Promise<Lesson> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId, courseId } })
    if (!lesson) throw new NotFoundError("Lesson not found")

    // Delete previous HLS files
    if (lesson.hlsPath) {
      await this.hlsService.deleteHls(lesson.hlsPath).catch(() => null)
      lesson.hlsPath = null
    }

    // Delete previous direct video (skip YouTube/external URLs)
    if (
      lesson.videoUrl &&
      !lesson.videoUrl.includes("youtube.com") &&
      !lesson.videoUrl.includes("youtu.be") &&
      !lesson.videoUrl.includes("/stream")
    ) {
      await this.storageService
        .delete(this.storageService.extractKey(lesson.videoUrl))
        .catch(() => null)
    }

    if (this.storageService.isHlsConfigured()) {
      // HLS path: convert to segments and upload
      const hlsPath = `courses/${courseId}/lessons/${lessonId}/hls`
      await this.hlsService.convertAndUpload(file.buffer, hlsPath, file.mimetype)
      lesson.hlsPath = hlsPath
      lesson.videoUrl = null
    } else {
      // Fallback: upload raw video directly
      const ext = file.originalname.split(".").pop() ?? "mp4"
      const key = `courses/${courseId}/lessons/${lessonId}/video-${Date.now()}.${ext}`
      const url = await this.storageService.upload(key, file.buffer, file.mimetype)
      lesson.videoUrl = url
    }

    lesson.type = LessonType.VIDEO
    return this.lessonRepo.save(lesson)
  }

  // ─── ADMIN: Delete course ─────────────────────────────────────────────────────

  async deleteCourse(courseId: string): Promise<void> {
    const course = await this.courseRepo.findOne({ where: { id: courseId } })
    if (!course) throw new NotFoundError("Course not found")

    // Delete all lesson S3 assets before removing the course
    const lessons = await this.lessonRepo.find({ where: { courseId } })
    for (const lesson of lessons) {
      if (lesson.hlsPath) {
        await this.hlsService.deleteHls(lesson.hlsPath).catch(() => null)
      }
      if (
        lesson.videoUrl &&
        !lesson.videoUrl.includes("youtube.com") &&
        !lesson.videoUrl.includes("youtu.be")
      ) {
        await this.storageService
          .delete(this.storageService.extractKey(lesson.videoUrl))
          .catch(() => null)
      }
      if (lesson.pdfUrl) {
        await this.storageService
          .delete(this.storageService.extractKey(lesson.pdfUrl))
          .catch(() => null)
      }
    }

    if (course.thumbnailUrl) {
      await this.storageService
        .delete(this.storageService.extractKey(course.thumbnailUrl))
        .catch(() => null)
    }

    await this.courseRepo.remove(course)
  }

  // ─── ADMIN: Delete lesson ─────────────────────────────────────────────────────

  async deleteLesson(courseId: string, lessonId: string): Promise<void> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId, courseId } })
    if (!lesson) throw new NotFoundError("Lesson not found")

    if (lesson.hlsPath) {
      await this.hlsService.deleteHls(lesson.hlsPath).catch(() => null)
    }
    if (
      lesson.videoUrl &&
      !lesson.videoUrl.includes("youtube.com") &&
      !lesson.videoUrl.includes("youtu.be")
    ) {
      await this.storageService
        .delete(this.storageService.extractKey(lesson.videoUrl))
        .catch(() => null)
    }
    if (lesson.pdfUrl) {
      await this.storageService
        .delete(this.storageService.extractKey(lesson.pdfUrl))
        .catch(() => null)
    }

    await this.lessonRepo.remove(lesson)

    const course = await this.courseRepo.findOne({ where: { id: courseId } })
    if (course && course.totalLessons > 0) {
      course.totalLessons -= 1
      await this.courseRepo.save(course)
    }
  }
}
