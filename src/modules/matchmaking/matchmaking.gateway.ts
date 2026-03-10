import { Server, Socket } from "socket.io"
import { Redis } from "ioredis"
import { v4 as uuidv4 } from "uuid"
import { Repository } from "typeorm"
import { parse as parseCookie } from "cookie"
import { User } from "../../entities/User.entity"
import { Profile } from "../../entities/Profile.entity"
import { verifyAccessToken } from "../auth/jwt.util"
import { generateTurnCredentials } from "../../utils/turn.util"
import { SessionService } from "../sessions/session.service"
import { StorageService } from "../../services/storage.service"
import logger from "../../config/logger"

// ─── Redis key helpers ─────────────────────────────────────────────────────────

const QUEUE_TTL = 5 * 60 // 5 minutes
const ROOM_TTL = 2 * 60 * 60 // 2 hours

const keys = {
  queue: (level: string) => `match:queue:${level}`,
  searching: (userId: string) => `match:searching:${userId}`,
  roomUsers: (roomId: string) => `match:room:${roomId}:users`,
  roomMeta: (roomId: string) => `match:room:${roomId}:meta`,
  userRoom: (userId: string) => `match:user:${userId}:room`,
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SocketData {
  userId: string
  email: string
  role: string
  isBanned: boolean
}

interface FindPartnerPayload {
  level?: string
  topic?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Pop a valid (still-searching) partner from the queue, skipping stale entries
async function popValidPartner(redis: Redis, level: string): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const partnerId = await redis.lpop(keys.queue(level))
    if (!partnerId) return null

    const isActive = await redis.get(keys.searching(partnerId))
    if (isActive) return partnerId

    logger.debug(`Skipped stale queue entry: ${partnerId}`)
  }
  return null
}

async function cleanupQueue(userId: string, redis: Redis): Promise<void> {
  await redis.del(keys.searching(userId))
  // Single global queue — remove from it
  await redis.lrem(keys.queue("all"), 0, userId)
}

// ─── Gateway ───────────────────────────────────────────────────────────────────

export function buildMatchmakingGateway(
  io: Server,
  redis: Redis,
  userRepo: Repository<User>,
  profileRepo: Repository<Profile>,
  sessionService: SessionService,
  storageService: StorageService,
): void {
  // ─── Socket auth middleware ─────────────────────────────────────────────────

  io.use(async (socket: Socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.headers?.authorization as string) ||
        ""

      let token = raw.replace(/^Bearer\s+/i, "")

      // Fallback: read accessToken from httpOnly cookie (sent automatically by browser)
      if (!token && socket.handshake.headers?.cookie) {
        const cookies = parseCookie(socket.handshake.headers.cookie as string)
        token = cookies.accessToken || ""
      }

      if (!token) return next(new Error("UNAUTHORIZED"))

      const payload = await verifyAccessToken(token)

      const user = await userRepo.findOne({ where: { id: payload.sub } })
      if (!user) return next(new Error("UNAUTHORIZED"))
      ;(socket.data as SocketData).userId = payload.sub
      ;(socket.data as SocketData).email = payload.email
      ;(socket.data as SocketData).role = payload.role
      ;(socket.data as SocketData).isBanned = user.isBanned

      next()
    } catch {
      next(new Error("UNAUTHORIZED"))
    }
  })

  // ─── Connection ─────────────────────────────────────────────────────────────

  io.on("connection", (socket: Socket) => {
    const { userId, isBanned } = socket.data as SocketData

    // Always join personal room (needed for support replies to reach banned users too)
    socket.join(`user:${userId}`)
    logger.debug(`Socket connected userId=${userId} socketId=${socket.id} banned=${isBanned}`)

    // Banned users are only allowed to use the support chat
    if (isBanned) return

    // ─── find_partner ─────────────────────────────────────────────────────────

    socket.on("find_partner", async (payload: FindPartnerPayload = {}) => {
      try {
        // Guard: already searching
        if (await redis.get(keys.searching(userId))) {
          socket.emit("error", { code: "ALREADY_SEARCHING", message: "Already in search queue" })
          return
        }

        // Guard: already in an active room
        if (await redis.get(keys.userRoom(userId))) {
          socket.emit("error", { code: "ALREADY_IN_ROOM", message: "Already in an active session" })
          return
        }

        // Fetch profile for display info in match_found payload
        // const profile = await profileRepo.findOne({ where: { userId } })

        // Everyone goes into the same global queue — no level restriction
        const level = "all"
        const topic = payload.topic || null

        // Try to pop a valid waiting partner
        const partnerId = await popValidPartner(redis, level)

        if (partnerId) {
          // ── Match found ──────────────────────────────────────────────────────
          const roomId = uuidv4()

          // Clean up partner's searching state
          await redis.del(keys.searching(partnerId))

          // Store room data in Redis
          await Promise.all([
            redis.sadd(keys.roomUsers(roomId), userId, partnerId),
            redis.expire(keys.roomUsers(roomId), ROOM_TTL),
            redis.hset(keys.roomMeta(roomId), {
              createdAt: new Date().toISOString(),
              topic: topic ?? "",
              level,
              userAId: partnerId,
              userBId: userId,
            }),
            redis.expire(keys.roomMeta(roomId), ROOM_TTL),
            redis.set(keys.userRoom(userId), roomId, "EX", ROOM_TTL),
            redis.set(keys.userRoom(partnerId), roomId, "EX", ROOM_TTL),
          ])

          // Create DB session record (non-blocking — don't fail the match if DB is slow)
          sessionService
            .createSession(roomId, partnerId, userId, level, topic)
            .catch((err) => logger.error("createSession failed", { error: err, roomId }))

          // Fetch both profiles for match_found payload
          const [myProfile, partnerProfile] = await Promise.all([
            profileRepo.findOne({ where: { userId } }),
            profileRepo.findOne({ where: { userId: partnerId } }),
          ])

          // Generate short-lived TURN credentials per user
          const myTurn = generateTurnCredentials(userId)
          const partnerTurn = generateTurnCredentials(partnerId)

          const buildIceServers = (creds: typeof myTurn) => [
            { urls: creds.urls, username: creds.username, credential: creds.credential },
          ]

          // Emit to partner
          io.to(`user:${partnerId}`).emit("match_found", {
            roomId,
            partner: {
              userId: myProfile?.userId,
              displayName: myProfile?.displayName || myProfile?.username,
              avatarUrl: storageService.signIfNeeded(myProfile?.avatarUrl ?? null),
              level: myProfile?.englishLevel,
            },
            iceServers: buildIceServers(partnerTurn),
          })

          // Emit to current user
          socket.emit("match_found", {
            roomId,
            partner: {
              userId: partnerProfile?.userId,
              displayName: partnerProfile?.displayName || partnerProfile?.username,
              avatarUrl: storageService.signIfNeeded(partnerProfile?.avatarUrl ?? null),
              level: partnerProfile?.englishLevel,
            },
            iceServers: buildIceServers(myTurn),
          })

          logger.info(`Match made roomId=${roomId} users=[${userId}, ${partnerId}] level=${level}`)
        } else {
          // ── No partner — join queue ──────────────────────────────────────────
          await redis.rpush(keys.queue(level), userId)
          await redis.set(keys.searching(userId), "1", "EX", QUEUE_TTL)
          socket.emit("searching", { estimated_wait_seconds: 30 })
          logger.debug(`User ${userId} queued level=${level}`)
        }
      } catch (err) {
        logger.error("find_partner error", { error: err, userId })
        socket.emit("error", { code: "INTERNAL_ERROR", message: "Something went wrong" })
      }
    })

    // ─── cancel_search ────────────────────────────────────────────────────────

    socket.on("cancel_search", async () => {
      try {
        await cleanupQueue(userId, redis)
        logger.debug(`User ${userId} cancelled search`)
      } catch (err) {
        logger.error("cancel_search error", { error: err, userId })
      }
    })

    // ─── disconnect ───────────────────────────────────────────────────────────

    socket.on("disconnect", async () => {
      try {
        // Remove from queue if still searching
        await cleanupQueue(userId, redis)

        // Notify partner if in a room and end the session
        const roomId = await redis.get(keys.userRoom(userId))
        if (roomId) {
          const members = await redis.smembers(keys.roomUsers(roomId))
          const partnerId = members.find((id) => id !== userId)
          if (partnerId) {
            io.to(`user:${partnerId}`).emit("peer_left", { reason: "disconnect" })
          }
          // End session record (idempotent — safe even if end_call already called)
          sessionService
            .endSession(roomId, userId)
            .catch((err) => logger.error("endSession on disconnect failed", { error: err, roomId }))

          await redis.del(keys.userRoom(userId))
        }

        logger.debug(`Socket disconnected userId=${userId}`)
      } catch (err) {
        logger.error("disconnect error", { error: err, userId })
      }
    })
  })
}
