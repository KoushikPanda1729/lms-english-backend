import { Router } from "express"
import { SessionController } from "./session.controller"
import { authMiddleware } from "../../middleware/auth.middleware"
import { adminMiddleware } from "../../middleware/admin.middleware"

export function sessionRouter(controller: SessionController): Router {
  const router = Router()

  router.use(authMiddleware)

  router.get("/", (req, res, next) => controller.getMyHistory(req, res, next))
  router.get("/by-room/:roomId", (req, res, next) => controller.getSessionByRoom(req, res, next))
  router.get("/:id", (req, res, next) => controller.getSession(req, res, next))
  router.post("/:id/rate", (req, res, next) => controller.rateSession(req, res, next))

  return router
}

export function adminSessionRouter(controller: SessionController): Router {
  const router = Router()

  router.use(authMiddleware)
  router.use(adminMiddleware)

  router.get("/sessions", (req, res, next) => controller.adminListSessions(req, res, next))
  router.get("/sessions/:id", (req, res, next) => controller.adminGetSession(req, res, next))

  return router
}
