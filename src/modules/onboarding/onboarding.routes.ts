import { Router } from "express"
import { OnboardingController } from "./onboarding.controller"
import { authMiddleware } from "../../middleware/auth.middleware"
import { adminMiddleware } from "../../middleware/admin.middleware"

// Public-ish routes (requires auth only — any user)
export function onboardingRouter(controller: OnboardingController): Router {
  const router = Router()

  router.use(authMiddleware)

  router.get("/questions", (req, res, next) => controller.getQuestions(req, res, next))
  router.post("/complete", (req, res, next) => controller.complete(req, res, next))

  return router
}

// Admin routes
export function adminOnboardingRouter(controller: OnboardingController): Router {
  const router = Router()

  router.use(authMiddleware)
  router.use(adminMiddleware)

  router.get("/onboarding/questions", (req, res, next) => controller.adminList(req, res, next))
  router.post("/onboarding/questions", (req, res, next) => controller.adminCreate(req, res, next))
  router.patch("/onboarding/questions/:id", (req, res, next) =>
    controller.adminUpdate(req, res, next),
  )
  router.delete("/onboarding/questions/:id", (req, res, next) =>
    controller.adminDelete(req, res, next),
  )

  return router
}
