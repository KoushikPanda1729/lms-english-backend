import { config } from "dotenv"
import path from "path"
import fs from "fs"

// Only load .env file if not in Docker (Docker uses --env-file flag)
const isDocker = fs.existsSync("/.dockerenv")
if (!isDocker) {
  const envPath = fs.existsSync(path.join(process.cwd(), `.env.${process.env.NODE_ENV}`))
    ? path.join(process.cwd(), `.env.${process.env.NODE_ENV}`)
    : path.join(__dirname, `../../.env.${process.env.NODE_ENV}`)

  config({ path: envPath })
}

const {
  // Server
  PORT,
  NODE_ENV,
  APP_URL,

  // Database
  DB_HOST,
  DB_PORT,
  DB_USERNAME,
  DB_PASSWORD,
  DB_NAME,

  // Redis
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,

  // CORS
  CORS_ORIGIN_WEB,
  CORS_ORIGIN_MOBILE,

  // JWT RS256 — stored inline with escaped \n  (generate with: npm run keys:generate)
  PRIVATE_KEY,
  PUBLIC_KEY,
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY,
  JWT_KEY_ID,

  // TURN Server (Coturn HMAC credentials)
  TURN_SECRET,
  TURN_HOST,
  TURN_PORT,

  // Payment
  PAYMENT_PROVIDER,
  PAYMENT_CURRENCY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,

  // Google OAuth
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,

  // Notifications
  NOTIFICATION_PROVIDER,

  // Firebase FCM
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,

  // File Storage (AWS S3 / Cloudflare R2 / MinIO)
  STORAGE_ENDPOINT,
  STORAGE_REGION,
  STORAGE_ACCESS_KEY,
  STORAGE_SECRET_KEY,
  STORAGE_BUCKET_NAME,
  STORAGE_PUBLIC_URL,

  // Email
  RESEND_API_KEY,
  EMAIL_FROM,

  // CloudFront signing (for HLS signed URLs)
  CLOUDFRONT_KEY_PAIR_ID,
  CLOUDFRONT_PRIVATE_KEY,

  // Admin seed (used in seed script to create first admin account)
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_FIRST_NAME,
  ADMIN_LAST_NAME,

  // AI Conversation
  AI_PROVIDER,
  OPENAI_API_KEY,
  GEMINI_API_KEY,
  GROQ_API_KEY,
} = process.env

// ─── PEM key handling ──────────────────────────────────────────────────────────
// Keys are stored in env vars with escaped \n → replace back to real newlines
// and strip surrounding quotes added by some env tools
const privateKey = (PRIVATE_KEY?.replace(/\\n/g, "\n") || "").replace(/^"|"$/g, "")
const publicKey = (PUBLIC_KEY?.replace(/\\n/g, "\n") || "").replace(/^"|"$/g, "")

// Firebase private key also has the same escaped newline issue
const firebasePrivateKey = (FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "").replace(/^"|"$/g, "")
const cloudFrontPrivateKey = (CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g, "\n") || "").replace(
  /^"|"$/g,
  "",
)

// ─── Export ────────────────────────────────────────────────────────────────────

export const Config = {
  // Server
  PORT: PORT || "5503",
  NODE_ENV: NODE_ENV || "development",
  APP_URL: APP_URL || "http://localhost:5503",

  // Database
  DB_HOST: DB_HOST || "localhost",
  DB_PORT: DB_PORT || "5432",
  DB_USERNAME: DB_USERNAME || "root",
  DB_PASSWORD: DB_PASSWORD || "root",
  DB_NAME: DB_NAME || "english_speaking_dev",

  // Redis
  REDIS_HOST: REDIS_HOST || "localhost",
  REDIS_PORT: REDIS_PORT || "6379",
  REDIS_PASSWORD: REDIS_PASSWORD || "",

  // CORS
  CORS_ORIGINS: [CORS_ORIGIN_WEB, CORS_ORIGIN_MOBILE].filter(Boolean) as string[],

  // JWT
  PRIVATE_KEY: privateKey,
  PUBLIC_KEY: publicKey,
  JWT_ACCESS_EXPIRY: JWT_ACCESS_EXPIRY || "15m",
  JWT_REFRESH_EXPIRY: JWT_REFRESH_EXPIRY || "30d",
  JWT_KEY_ID: JWT_KEY_ID || "key-v1",

  // TURN
  TURN_SECRET: TURN_SECRET || "",
  TURN_HOST: TURN_HOST || "",
  TURN_PORT: TURN_PORT || "3478",

  // Payment
  PAYMENT_PROVIDER: (PAYMENT_PROVIDER || "stripe") as "stripe" | "razorpay",
  PAYMENT_CURRENCY: PAYMENT_CURRENCY || "inr",
  STRIPE_SECRET_KEY: STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET || "",
  STRIPE_SUCCESS_URL: STRIPE_SUCCESS_URL || "",
  STRIPE_CANCEL_URL: STRIPE_CANCEL_URL || "",
  RAZORPAY_KEY_ID: RAZORPAY_KEY_ID || "",
  RAZORPAY_KEY_SECRET: RAZORPAY_KEY_SECRET || "",
  RAZORPAY_WEBHOOK_SECRET: RAZORPAY_WEBHOOK_SECRET || "",

  // Google OAuth
  GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: GOOGLE_CLIENT_SECRET || "",

  // Notifications
  NOTIFICATION_PROVIDER: (NOTIFICATION_PROVIDER || "fcm") as "fcm",

  // Firebase
  FIREBASE_PROJECT_ID: FIREBASE_PROJECT_ID || "",
  FIREBASE_CLIENT_EMAIL: FIREBASE_CLIENT_EMAIL || "",
  FIREBASE_PRIVATE_KEY: firebasePrivateKey,

  // Storage
  STORAGE_ENDPOINT: STORAGE_ENDPOINT || "",
  STORAGE_REGION: STORAGE_REGION || "us-east-1",
  STORAGE_ACCESS_KEY: STORAGE_ACCESS_KEY || "",
  STORAGE_SECRET_KEY: STORAGE_SECRET_KEY || "",
  STORAGE_BUCKET_NAME: STORAGE_BUCKET_NAME || "",
  STORAGE_PUBLIC_URL: STORAGE_PUBLIC_URL || "",

  // CloudFront signing
  CLOUDFRONT_KEY_PAIR_ID: CLOUDFRONT_KEY_PAIR_ID || "",
  CLOUDFRONT_PRIVATE_KEY: cloudFrontPrivateKey,

  // Email
  RESEND_API_KEY: RESEND_API_KEY || "",
  EMAIL_FROM: EMAIL_FROM || "noreply@yourdomain.com",

  // Admin seed
  ADMIN_EMAIL: ADMIN_EMAIL || "",
  ADMIN_PASSWORD: ADMIN_PASSWORD || "",
  ADMIN_FIRST_NAME: ADMIN_FIRST_NAME || "",
  ADMIN_LAST_NAME: ADMIN_LAST_NAME || "",

  // AI Conversation
  AI_PROVIDER: (AI_PROVIDER || "groq") as "openai" | "gemini" | "groq",
  OPENAI_API_KEY: OPENAI_API_KEY || "",
  GEMINI_API_KEY: GEMINI_API_KEY || "",
  GROQ_API_KEY: GROQ_API_KEY || "",
}
