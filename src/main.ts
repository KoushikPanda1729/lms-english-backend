import "reflect-metadata"
import { createServer } from "http"
import { Server as SocketIOServer } from "socket.io"
import { AppDataSource } from "./config/database.config"
import { createRedisClient } from "./config/redis.config"
import { buildContainer } from "./container"
import { buildApp } from "./app"
import { buildMatchmakingGateway } from "./modules/matchmaking/matchmaking.gateway"
import { buildSignalingGateway } from "./modules/signaling/signaling.gateway"
import { buildSupportGateway } from "./modules/support/support.gateway"
import { Config } from "./config/config"
import logger from "./config/logger"

async function bootstrap() {
  try {
    // ── Database ──────────────────────────────────────────────────────────────
    await AppDataSource.initialize()
    logger.info("PostgreSQL connected")

    // ── Redis ─────────────────────────────────────────────────────────────────
    const redis = createRedisClient()
    await redis.ping()
    logger.info("Redis connected")

    // ── DI Container ──────────────────────────────────────────────────────────
    const container = buildContainer()

    // ── Express ───────────────────────────────────────────────────────────────
    const app = buildApp(container)
    const httpServer = createServer(app)

    // ── Socket.io ─────────────────────────────────────────────────────────────
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: Config.CORS_ORIGINS.length ? Config.CORS_ORIGINS : "*",
        credentials: true,
      },
    })

    buildMatchmakingGateway(
      io,
      redis,
      container.userRepo,
      container.profileRepo,
      container.sessionService,
    )
    logger.info("Matchmaking gateway ready")

    buildSignalingGateway(io, redis, container.sessionService)
    logger.info("Signaling gateway ready")

    buildSupportGateway(io, container.supportService, container.profileRepo)
    logger.info("Support gateway ready")

    // ── Listen ────────────────────────────────────────────────────────────────
    httpServer.listen(Number(Config.PORT), "0.0.0.0", () => {
      logger.info(`Server running → http://localhost:${Config.PORT}`)
      logger.info(`Environment    → ${Config.NODE_ENV}`)
    })
  } catch (err) {
    logger.error("Failed to start server", { error: err })
    process.exit(1)
  }
}

bootstrap()
