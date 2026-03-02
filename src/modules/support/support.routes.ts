import { Router } from "express"
import { authMiddleware } from "../../middleware/auth.middleware"
import { adminMiddleware } from "../../middleware/admin.middleware"
import type { SupportController } from "./support.controller"

export function supportRouter(controller: SupportController): Router {
  const router = Router()

  router.use(authMiddleware)
  router.use(adminMiddleware)

  router.get("/support/conversations", (req, res, next) =>
    controller.listConversations(req, res, next),
  )
  router.get("/support/conversations/:userId", (req, res, next) =>
    controller.getConversation(req, res, next),
  )
  router.get("/support/unread", (req, res, next) => controller.getTotalUnread(req, res, next))
  router.patch("/support/conversations/:userId/read", (req, res, next) =>
    controller.markRead(req, res, next),
  )

  return router
}
