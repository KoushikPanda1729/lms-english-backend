import express, { Application } from "express"
import cors from "cors"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"
import { Config } from "./config/config"
import { authRouter } from "./modules/auth/auth.routes"
import { userRouter } from "./modules/users/user.routes"
import { sessionRouter, adminSessionRouter } from "./modules/sessions/session.routes"
import { reportRouter, adminRouter } from "./modules/reports/report.routes"
import { adminUserRouter } from "./modules/admin/admin.routes"
import { courseRouter, adminCourseRouter } from "./modules/courses/course.routes"
import {
  notificationRouter,
  adminNotificationRouter,
} from "./modules/notifications/notification.routes"
import { paymentRouter } from "./modules/payments/payment.routes"
import { couponRouter } from "./modules/coupons/coupon.routes"
import { supportRouter, publicSupportRouter } from "./modules/support/support.routes"
import { onboardingRouter, adminOnboardingRouter } from "./modules/onboarding/onboarding.routes"
import { jwksRouter } from "./modules/well-known/jwks.routes"
import { globalErrorHandler } from "./middleware/error.middleware"
import type { Container } from "./container"

export function buildApp(container: Container): Application {
  const app = express()

  // ─── Security middleware — applied FIRST (before all routes including webhook) ─
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  )
  app.use(helmet())
  app.use(cookieParser())
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  // ─── Stripe webhook — MUST be before express.json() ─────────────────────────
  // Stripe signature verification requires the raw unparsed body (Buffer).
  // The /webhook route uses express.raw() inline (see payment.routes.ts).
  // Other /payments routes use express.json() inline where needed.
  app.use("/payments", paymentRouter(container.paymentController))

  // ─── Body parsing — after webhook so raw body is preserved ──────────────────
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // ─── App locals (shared across middleware) ───────────────────────────────────
  app.locals.userRepo = container.userRepo

  // ─── Health check ────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: Config.NODE_ENV,
    })
  })

  // ─── Routes ──────────────────────────────────────────────────────────────────
  app.use("/auth", authRouter(container.authController))
  app.use("/users", userRouter(container.userController))
  app.use("/sessions", sessionRouter(container.sessionController))
  app.use("/admin", adminSessionRouter(container.sessionController))
  app.use("/reports", reportRouter(container.reportController))
  app.use("/admin", adminRouter(container.reportController))
  app.use("/admin", adminUserRouter(container.adminController))
  app.use("/notifications", notificationRouter(container.notificationController))
  app.use("/admin", adminNotificationRouter(container.notificationController))
  app.use("/courses", courseRouter(container.courseController))
  app.use("/admin", adminCourseRouter(container.courseController))
  app.use("/admin", couponRouter(container.couponController))
  app.use("/admin", supportRouter(container.supportController))
  app.use("/support", publicSupportRouter(container.supportController))
  app.use("/onboarding", onboardingRouter(container.onboardingController))
  app.use("/admin", adminOnboardingRouter(container.onboardingController))
  app.use("/.well-known", jwksRouter())

  // ─── Global error handler (must be last) ─────────────────────────────────────
  app.use(globalErrorHandler)

  return app
}
