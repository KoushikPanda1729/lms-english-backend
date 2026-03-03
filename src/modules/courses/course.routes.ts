import { Router } from "express"
import multer from "multer"
import { CourseController } from "./course.controller"
import { authMiddleware } from "../../middleware/auth.middleware"
import { adminMiddleware } from "../../middleware/admin.middleware"
import { optionalAuthMiddleware } from "../../middleware/optionalAuth.middleware"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB — covers PDFs and thumbnails
})

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB for video files
})

// ─── User routes: mounted at /courses ─────────────────────────────────────────

export function courseRouter(controller: CourseController): Router {
  const router = Router()

  // Public — optional auth to attach enrollment data for logged-in users
  router.get("/", optionalAuthMiddleware, (req, res, next) =>
    controller.listCourses(req, res, next),
  )
  router.get("/:id", optionalAuthMiddleware, (req, res, next) =>
    controller.getCourse(req, res, next),
  )

  // Authenticated
  router.get("/my", authMiddleware, (req, res, next) => controller.getMyCourses(req, res, next))

  router.post("/:id/enroll", authMiddleware, (req, res, next) => controller.enroll(req, res, next))
  router.get("/:id/lessons/:lessonId", authMiddleware, (req, res, next) =>
    controller.getLesson(req, res, next),
  )
  router.post("/:id/lessons/:lessonId/complete", authMiddleware, (req, res, next) =>
    controller.completeLesson(req, res, next),
  )
  router.get("/:id/lessons/:lessonId/quiz", authMiddleware, (req, res, next) =>
    controller.getQuiz(req, res, next),
  )
  router.post("/:id/lessons/:lessonId/quiz/submit", authMiddleware, (req, res, next) =>
    controller.submitQuiz(req, res, next),
  )

  return router
}

// ─── Admin routes: mounted at /admin ──────────────────────────────────────────

export function adminCourseRouter(controller: CourseController): Router {
  const router = Router()

  router.use(authMiddleware)
  router.use(adminMiddleware)

  router.get("/courses", (req, res, next) => controller.adminListCourses(req, res, next))
  router.get("/courses/:id/lessons", (req, res, next) =>
    controller.adminListLessons(req, res, next),
  )
  router.post("/courses", (req, res, next) => controller.adminCreateCourse(req, res, next))
  router.patch("/courses/:id", (req, res, next) => controller.adminUpdateCourse(req, res, next))
  router.delete("/courses/:id", (req, res, next) => controller.adminDeleteCourse(req, res, next))
  router.post("/courses/:id/thumbnail", upload.single("thumbnail"), (req, res, next) =>
    controller.adminUploadThumbnail(req, res, next),
  )

  router.post("/courses/:id/lessons", (req, res, next) =>
    controller.adminCreateLesson(req, res, next),
  )
  router.patch("/courses/:id/lessons/:lessonId", (req, res, next) =>
    controller.adminUpdateLesson(req, res, next),
  )
  router.post("/courses/:id/lessons/:lessonId/pdf", upload.single("pdf"), (req, res, next) =>
    controller.adminUploadLessonPdf(req, res, next),
  )
  router.post(
    "/courses/:id/lessons/:lessonId/video",
    videoUpload.single("video"),
    (req, res, next) => controller.adminUploadVideo(req, res, next),
  )
  router.delete("/courses/:id/lessons/:lessonId", (req, res, next) =>
    controller.adminDeleteLesson(req, res, next),
  )

  router.get("/courses/:id/lessons/:lessonId/quiz", (req, res, next) =>
    controller.adminGetQuiz(req, res, next),
  )
  router.post("/courses/:id/lessons/:lessonId/quiz", (req, res, next) =>
    controller.adminCreateQuiz(req, res, next),
  )
  router.patch("/courses/:id/lessons/:lessonId/quiz", (req, res, next) =>
    controller.adminUpdateQuiz(req, res, next),
  )

  return router
}
