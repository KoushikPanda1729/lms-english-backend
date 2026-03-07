import { Router } from "express"
import multer from "multer"
import { AIConversationController } from "./ai-conversation.controller"
import { authMiddleware } from "../../middleware/auth.middleware"
import { adminMiddleware } from "../../middleware/admin.middleware"

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

export function aiConversationRouter(controller: AIConversationController): Router {
  const router = Router()

  router.use(authMiddleware)

  // User routes
  router.get("/personas", (req, res, next) => controller.listPersonas(req, res, next))
  router.post("/message", (req, res, next) => controller.sendMessage(req, res, next))
  router.post("/sessions/:personaId", (req, res, next) => controller.startSession(req, res, next))
  router.patch("/sessions/:sessionId/end", (req, res, next) =>
    controller.endSession(req, res, next),
  )
  router.get("/sessions/history", (req, res, next) => controller.getMyHistory(req, res, next))

  return router
}

export function adminAIConversationRouter(controller: AIConversationController): Router {
  const router = Router()

  router.use(authMiddleware)
  router.use(adminMiddleware)

  // Admin routes
  router.post("/ai-personas/seed", (req, res, next) => controller.seedPersonas(req, res, next))
  router.get("/ai-personas/stats", (req, res, next) => controller.getAdminStats(req, res, next))
  router.get("/ai-personas", (req, res, next) => controller.listPersonasAdmin(req, res, next))
  router.post("/ai-personas", (req, res, next) => controller.createPersona(req, res, next))
  router.get("/ai-personas/:id", (req, res, next) => controller.getPersona(req, res, next))
  router.patch("/ai-personas/:id", (req, res, next) => controller.updatePersona(req, res, next))
  router.delete("/ai-personas/:id", (req, res, next) => controller.deletePersona(req, res, next))
  router.post("/ai-personas/:id/avatar", avatarUpload.single("avatar"), (req, res, next) =>
    controller.uploadAvatar(req, res, next),
  )

  return router
}
