import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { PaymentService } from "./payment.service"
import { success } from "../../shared/response"
import { ValidationError } from "../../shared/errors"

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const checkoutSchema = z.object({
  priceToken: z.string().uuid("priceToken must be a valid UUID"),
})

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ─── GET /payments/courses/:courseId/quote ────────────────────────────────────

  async createPriceQuote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = String(req.params.courseId)
      if (!uuidRegex.test(courseId)) throw new ValidationError("Invalid course ID")

      const couponCode = req.query.coupon as string | undefined

      const result = await this.paymentService.createPriceQuote(courseId, req.user!.id, couponCode)
      res.json(success(result, "Price quote generated"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /payments/courses/:courseId/checkout ────────────────────────────────

  async createCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = String(req.params.courseId)
      if (!uuidRegex.test(courseId)) throw new ValidationError("Invalid course ID")

      // Idempotency-Key: client-generated UUID — same key on retry returns cached result
      const idempotencyKey = req.headers["idempotency-key"] as string
      if (!idempotencyKey || !uuidRegex.test(idempotencyKey)) {
        throw new ValidationError("Idempotency-Key header is required (UUID format)")
      }

      const parsed = checkoutSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.paymentService.createCheckout(
        courseId,
        req.user!.id,
        idempotencyKey,
        parsed.data.priceToken,
      )
      res.status(201).json(success(result, "Checkout session created"))
    } catch (err) {
      next(err)
    }
  }

  // ─── POST /payments/webhook ───────────────────────────────────────────────────
  // NOTE: uses express.raw() — body is Buffer, NOT parsed JSON

  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers["stripe-signature"] as string
      if (!signature) throw new ValidationError("Missing stripe-signature header")

      await this.paymentService.handleWebhook(req.body as Buffer, signature)
      res.json({ received: true })
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /payments/courses/:courseId/coupons ──────────────────────────────────

  async listAvailableCoupons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = String(req.params.courseId)
      if (!uuidRegex.test(courseId)) throw new ValidationError("Invalid course ID")

      const coupons = await this.paymentService.listAvailableCoupons(courseId)
      res.json(success(coupons, "Available coupons fetched"))
    } catch (err) {
      next(err)
    }
  }

  // ─── GET /payments/history ────────────────────────────────────────────────────

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query)
      if (!parsed.success) throw new ValidationError(parsed.error.errors[0].message)

      const result = await this.paymentService.getHistory(
        req.user!.id,
        parsed.data.page,
        parsed.data.limit,
      )
      res.json(success(result, "Payment history fetched"))
    } catch (err) {
      next(err)
    }
  }
}
