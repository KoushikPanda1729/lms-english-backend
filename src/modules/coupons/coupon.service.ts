import { Repository } from "typeorm"
import { Coupon } from "../../entities/Coupon.entity"
import { Course } from "../../entities/Course.entity"
import { NotFoundError, ValidationError } from "../../shared/errors"

export class CouponService {
  constructor(
    private readonly couponRepo: Repository<Coupon>,
    private readonly courseRepo: Repository<Course>,
  ) {}

  // ─── POST /admin/coupons ──────────────────────────────────────────────────────

  async create(data: {
    code: string
    discountPercent: number
    courseId?: string | null
    maxUses?: number | null
    expiresAt?: Date | null
  }): Promise<Coupon> {
    const upperCode = data.code.toUpperCase()

    const existing = await this.couponRepo.findOne({ where: { code: upperCode } })
    if (existing) throw new ValidationError("A coupon with this code already exists")

    if (data.courseId) {
      const course = await this.courseRepo.findOne({ where: { id: data.courseId } })
      if (!course) throw new NotFoundError("Course not found")
    }

    const coupon = this.couponRepo.create({
      code: upperCode,
      discountPercent: data.discountPercent,
      courseId: data.courseId ?? null,
      maxUses: data.maxUses ?? null,
      expiresAt: data.expiresAt ?? null,
      isActive: true,
      usedCount: 0,
    })

    return this.couponRepo.save(coupon)
  }

  // ─── GET /admin/coupons ───────────────────────────────────────────────────────

  async list(opts: {
    page: number
    limit: number
    isActive?: boolean
    courseId?: string | null
  }): Promise<{ coupons: Coupon[]; total: number; page: number; limit: number }> {
    const qb = this.couponRepo.createQueryBuilder("c")

    if (opts.isActive !== undefined) {
      qb.andWhere("c.is_active = :isActive", { isActive: opts.isActive })
    }
    if (opts.courseId !== undefined) {
      if (opts.courseId === null) {
        qb.andWhere("c.course_id IS NULL")
      } else {
        qb.andWhere("c.course_id = :courseId", { courseId: opts.courseId })
      }
    }

    qb.orderBy("c.created_at", "DESC")
      .skip((opts.page - 1) * opts.limit)
      .take(opts.limit)

    const [coupons, total] = await qb.getManyAndCount()
    return { coupons, total, page: opts.page, limit: opts.limit }
  }

  // ─── GET /admin/coupons/:id ───────────────────────────────────────────────────

  async getById(id: string): Promise<Coupon> {
    const coupon = await this.couponRepo.findOne({ where: { id } })
    if (!coupon) throw new NotFoundError("Coupon not found")
    return coupon
  }

  // ─── PATCH /admin/coupons/:id ─────────────────────────────────────────────────

  async update(
    id: string,
    data: {
      isActive?: boolean
      maxUses?: number | null
      expiresAt?: Date | null
    },
  ): Promise<Coupon> {
    const coupon = await this.getById(id)

    if (data.isActive !== undefined) coupon.isActive = data.isActive
    if (data.maxUses !== undefined) coupon.maxUses = data.maxUses
    if (data.expiresAt !== undefined) coupon.expiresAt = data.expiresAt

    return this.couponRepo.save(coupon)
  }

  // ─── DELETE /admin/coupons/:id ────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const coupon = await this.getById(id)
    await this.couponRepo.remove(coupon)
  }

  // ─── GET public available coupons for a course ───────────────────────────────
  // Returns active, non-expired, non-exhausted coupons that apply to courseId
  // (global coupons + course-specific ones). Only safe fields are exposed.

  async listAvailableForCourse(
    courseId: string,
  ): Promise<{ code: string; discountPercent: number; expiresAt: Date | null }[]> {
    const now = new Date()

    const coupons = await this.couponRepo
      .createQueryBuilder("c")
      .where("c.is_active = true")
      .andWhere("(c.expires_at IS NULL OR c.expires_at > :now)", { now })
      .andWhere("(c.max_uses IS NULL OR c.used_count < c.max_uses)")
      .andWhere("(c.course_id IS NULL OR c.course_id = :courseId)", { courseId })
      .orderBy("c.discount_percent", "DESC")
      .getMany()

    return coupons.map((c) => ({
      code: c.code,
      discountPercent: c.discountPercent,
      expiresAt: c.expiresAt,
    }))
  }

  // ─── Validate coupon at quote time ────────────────────────────────────────────
  // Called by PaymentService.createPriceQuote

  async validate(code: string, courseId: string): Promise<Coupon> {
    const upperCode = code.toUpperCase()
    const coupon = await this.couponRepo.findOne({ where: { code: upperCode } })

    if (!coupon) throw new ValidationError("Invalid coupon code")

    if (!coupon.isActive) throw new ValidationError("Coupon is no longer active")

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new ValidationError("Coupon has expired")
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new ValidationError("Coupon has reached its usage limit")
    }

    // courseId = null means global; if set, must match
    if (coupon.courseId !== null && coupon.courseId !== courseId) {
      throw new ValidationError("Coupon is not valid for this course")
    }

    return coupon
  }

  // ─── Atomically increment usage count ────────────────────────────────────────
  // Called inside the webhook transaction after payment is marked PAID

  async incrementUsage(couponId: string): Promise<void> {
    await this.couponRepo.increment({ id: couponId }, "usedCount", 1)
  }
}
