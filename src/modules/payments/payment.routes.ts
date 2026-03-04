import { Router, raw, json } from "express"
import { PaymentController } from "./payment.controller"
import { authMiddleware } from "../../middleware/auth.middleware"

export function paymentRouter(controller: PaymentController): Router {
  const router = Router()

  // ── Stripe webhook ────────────────────────────────────────────────────────────
  // express.raw() captures the unparsed body as Buffer — required for HMAC verification.
  // express.json() runs AFTER this router in app.ts, so raw() must be inline here.
  // Stripe calls this directly — no authMiddleware.
  router.post("/webhook", raw({ type: "application/json" }), (req, res, next) =>
    controller.handleWebhook(req, res, next),
  )

  // ── Authenticated routes ──────────────────────────────────────────────────────

  // Available coupons for a course (auth-only, non-admin)
  router.get("/courses/:courseId/coupons", authMiddleware, (req, res, next) =>
    controller.listAvailableCoupons(req, res, next),
  )

  // Step 1 — Get a short-lived price quote token (10 min TTL, one active per user+course)
  router.get("/courses/:courseId/quote", authMiddleware, (req, res, next) =>
    controller.createPriceQuote(req, res, next),
  )

  // Step 2 — Create Stripe checkout session using the price token.
  // express.json() is inline here because this route is mounted before the global
  // express.json() middleware in app.ts (required to keep the webhook raw).
  router.post("/courses/:courseId/checkout", json(), authMiddleware, (req, res, next) =>
    controller.createCheckout(req, res, next),
  )

  // Payment history
  router.get("/history", authMiddleware, (req, res, next) => controller.getHistory(req, res, next))

  return router
}
