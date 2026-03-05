import { Router } from "express"
import { AdminController } from "./admin.controller"
import { authMiddleware } from "../../middleware/auth.middleware"
import { adminMiddleware } from "../../middleware/admin.middleware"

export function adminUserRouter(controller: AdminController): Router {
  const router = Router()

  router.use(authMiddleware)
  router.use(adminMiddleware)

  router.get("/stats", (req, res, next) => controller.getStats(req, res, next))
  router.get("/analytics", (req, res, next) => controller.getAnalytics(req, res, next))
  router.get("/users", (req, res, next) => controller.listUsers(req, res, next))
  router.get("/users/:id", (req, res, next) => controller.getUserDetail(req, res, next))
  router.get("/users/:id/courses", (req, res, next) => controller.getUserCourses(req, res, next))
  router.get("/courses/:courseId/students", (req, res, next) =>
    controller.getCourseStudents(req, res, next),
  )
  router.patch("/users/:id/ban", (req, res, next) => controller.setUserBanned(req, res, next))
  router.patch("/users/:id/role", (req, res, next) => controller.setUserRole(req, res, next))
  router.post("/notifications", (req, res, next) => controller.sendNotification(req, res, next))

  return router
}
