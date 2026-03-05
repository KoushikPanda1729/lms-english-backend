import { Router } from "express"
import { NotificationController } from "./notification.controller"
import { authMiddleware } from "../../middleware/auth.middleware"
import { adminMiddleware } from "../../middleware/admin.middleware"

export function notificationRouter(controller: NotificationController): Router {
  const router = Router()

  router.use(authMiddleware)

  router.post("/device", (req, res, next) => controller.registerDevice(req, res, next))
  router.delete("/device", (req, res, next) => controller.unregisterDevice(req, res, next))
  router.get("/", (req, res, next) => controller.getMyNotifications(req, res, next))
  router.get("/unread-count", (req, res, next) => controller.getUnreadCount(req, res, next))
  router.patch("/read-all", (req, res, next) => controller.markAllAsRead(req, res, next))
  router.patch("/:id/read", (req, res, next) => controller.markAsRead(req, res, next))

  return router
}

export function adminNotificationRouter(controller: NotificationController): Router {
  const router = Router()

  router.use(authMiddleware)
  router.use(adminMiddleware)

  router.post("/notifications", (req, res, next) =>
    controller.adminSendNotification(req, res, next),
  )
  router.get("/notifications", (req, res, next) =>
    controller.adminListNotifications(req, res, next),
  )
  router.delete("/notifications", (req, res, next) =>
    controller.adminDeleteBroadcast(req, res, next),
  )

  return router
}
