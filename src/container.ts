import { AppDataSource } from "./config/database.config"
import { User } from "./entities/User.entity"
import { RefreshToken } from "./entities/RefreshToken.entity"
import { PasswordResetToken } from "./entities/PasswordResetToken.entity"
import { Profile } from "./entities/Profile.entity"
import { CallSession } from "./entities/CallSession.entity"
import { SessionRating } from "./entities/SessionRating.entity"
import { Report } from "./entities/Report.entity"
import { DeviceToken } from "./entities/DeviceToken.entity"
import { Notification } from "./entities/Notification.entity"
import { AuthService } from "./modules/auth/auth.service"
import { AuthController } from "./modules/auth/auth.controller"
import { UserService } from "./modules/users/user.service"
import { UserController } from "./modules/users/user.controller"
import { SessionService } from "./modules/sessions/session.service"
import { SessionController } from "./modules/sessions/session.controller"
import { ReportService } from "./modules/reports/report.service"
import { ReportController } from "./modules/reports/report.controller"
import { AdminService } from "./modules/admin/admin.service"
import { AdminController } from "./modules/admin/admin.controller"
import { NotificationService } from "./modules/notifications/notification.service"
import { NotificationController } from "./modules/notifications/notification.controller"
import { createNotificationProvider } from "./modules/notifications/providers/notification-provider.factory"
import { StorageService } from "./services/storage.service"
import { HlsService } from "./services/hls.service"
import { Course } from "./entities/Course.entity"
import { Lesson } from "./entities/Lesson.entity"
import { Quiz } from "./entities/Quiz.entity"
import { QuizQuestion } from "./entities/QuizQuestion.entity"
import { QuizOption } from "./entities/QuizOption.entity"
import { UserCourseProgress } from "./entities/UserCourseProgress.entity"
import { UserLessonProgress } from "./entities/UserLessonProgress.entity"
import { UserQuizAttempt } from "./entities/UserQuizAttempt.entity"
import { CourseService } from "./modules/courses/course.service"
import { QuizService } from "./modules/courses/quiz.service"
import { CourseController } from "./modules/courses/course.controller"
import { Payment } from "./entities/Payment.entity"
import { PaymentService } from "./modules/payments/payment.service"
import { PaymentController } from "./modules/payments/payment.controller"
import { createPaymentProvider } from "./modules/payments/providers/payment-provider.factory"
import { getRedisClient } from "./config/redis.config"
import { Coupon } from "./entities/Coupon.entity"
import { CouponService } from "./modules/coupons/coupon.service"
import { CouponController } from "./modules/coupons/coupon.controller"
import { SupportMessage } from "./entities/SupportMessage.entity"
import { SupportService } from "./modules/support/support.service"
import { SupportController } from "./modules/support/support.controller"
import { OnboardingQuestion } from "./entities/OnboardingQuestion.entity"
import { OnboardingService } from "./modules/onboarding/onboarding.service"
import { OnboardingController } from "./modules/onboarding/onboarding.controller"

export function buildContainer() {
  // ─── Repositories ───────────────────────────────────────────────────────────
  const userRepo = AppDataSource.getRepository(User)
  const refreshTokenRepo = AppDataSource.getRepository(RefreshToken)
  const passwordResetTokenRepo = AppDataSource.getRepository(PasswordResetToken)
  const profileRepo = AppDataSource.getRepository(Profile)
  const sessionRepo = AppDataSource.getRepository(CallSession)
  const ratingRepo = AppDataSource.getRepository(SessionRating)
  const reportRepo = AppDataSource.getRepository(Report)
  const deviceTokenRepo = AppDataSource.getRepository(DeviceToken)
  const notificationRepo = AppDataSource.getRepository(Notification)
  const courseRepo = AppDataSource.getRepository(Course)
  const lessonRepo = AppDataSource.getRepository(Lesson)
  const quizRepo = AppDataSource.getRepository(Quiz)
  const quizQuestionRepo = AppDataSource.getRepository(QuizQuestion)
  const quizOptionRepo = AppDataSource.getRepository(QuizOption)
  const courseProgressRepo = AppDataSource.getRepository(UserCourseProgress)
  const lessonProgressRepo = AppDataSource.getRepository(UserLessonProgress)
  const quizAttemptRepo = AppDataSource.getRepository(UserQuizAttempt)
  const paymentRepo = AppDataSource.getRepository(Payment)
  const couponRepo = AppDataSource.getRepository(Coupon)
  const supportMessageRepo = AppDataSource.getRepository(SupportMessage)
  const onboardingQuestionRepo = AppDataSource.getRepository(OnboardingQuestion)

  // ─── Shared services ────────────────────────────────────────────────────────
  const storageService = new StorageService()
  const hlsService = new HlsService(storageService)
  const redis = getRedisClient()

  // ─── Notifications (constructed early — needed by AuthController & PaymentService) ──
  const notificationProvider = createNotificationProvider()
  const notificationService = new NotificationService(
    deviceTokenRepo,
    notificationRepo,
    notificationProvider,
  )
  const notificationController = new NotificationController(notificationService)

  // ─── Auth ───────────────────────────────────────────────────────────────────
  const authService = new AuthService(
    userRepo,
    refreshTokenRepo,
    passwordResetTokenRepo,
    AppDataSource,
  )
  const authController = new AuthController(authService, notificationService)

  // ─── Users ──────────────────────────────────────────────────────────────────
  const userService = new UserService(profileRepo, storageService)
  const userController = new UserController(userService)

  // ─── Sessions ───────────────────────────────────────────────────────────────
  const sessionService = new SessionService(sessionRepo, ratingRepo, profileRepo)
  const sessionController = new SessionController(sessionService)

  // ─── Reports ────────────────────────────────────────────────────────────────
  const reportService = new ReportService(reportRepo, userRepo, refreshTokenRepo)
  const reportController = new ReportController(reportService)

  // ─── Admin ──────────────────────────────────────────────────────────────────
  const adminService = new AdminService(
    userRepo,
    profileRepo,
    refreshTokenRepo,
    reportRepo,
    sessionRepo,
    notificationService,
    courseRepo,
    paymentRepo,
    courseProgressRepo,
  )
  const adminController = new AdminController(adminService)

  // ─── Courses & LMS ──────────────────────────────────────────────────────────
  const courseService = new CourseService(
    courseRepo,
    lessonRepo,
    courseProgressRepo,
    lessonProgressRepo,
    storageService,
    hlsService,
  )
  const quizService = new QuizService(
    quizRepo,
    quizQuestionRepo,
    quizOptionRepo,
    quizAttemptRepo,
    courseProgressRepo,
    courseRepo,
    lessonRepo,
    courseService,
  )
  const courseController = new CourseController(courseService, quizService)

  // ─── Coupons ─────────────────────────────────────────────────────────────────
  const couponService = new CouponService(couponRepo, courseRepo)
  const couponController = new CouponController(couponService)

  // ─── Support Chat ────────────────────────────────────────────────────────────
  const supportService = new SupportService(supportMessageRepo)
  const supportController = new SupportController(supportService)

  // ─── Onboarding ──────────────────────────────────────────────────────────────
  const onboardingService = new OnboardingService(onboardingQuestionRepo, profileRepo)
  const onboardingController = new OnboardingController(onboardingService)

  // ─── Payments ───────────────────────────────────────────────────────────────
  const paymentProvider = createPaymentProvider()
  const paymentService = new PaymentService(
    paymentRepo,
    courseRepo,
    courseProgressRepo,
    paymentProvider,
    AppDataSource,
    redis,
    notificationService,
    couponService,
  )
  const paymentController = new PaymentController(paymentService)

  return {
    authController,
    userController,
    sessionController,
    sessionService,
    reportController,
    adminController,
    notificationController,
    notificationService,
    courseController,
    paymentController,
    couponController,
    supportService,
    supportController,
    onboardingController,
    userRepo,
    profileRepo,
  }
}

export type Container = ReturnType<typeof buildContainer>
