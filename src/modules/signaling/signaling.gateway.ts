import { Server, Socket } from "socket.io"
import { Redis } from "ioredis"
import { SessionService } from "../sessions/session.service"
import logger from "../../config/logger"

// ─── Redis key helpers ─────────────────────────────────────────────────────────

const ROOM_TTL = 2 * 60 * 60 // 2 hours

const keys = {
  roomUsers: (roomId: string) => `match:room:${roomId}:users`,
  roomMeta: (roomId: string) => `match:room:${roomId}:meta`,
  userRoom: (userId: string) => `match:user:${userId}:room`,
  caller: (roomId: string) => `sig:room:${roomId}:caller`,
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SocketData {
  userId: string
  email: string
  role: string
}

interface JoinRoomPayload {
  roomId: string
}

interface SignalPayload {
  roomId: string
  sdp?: unknown
  candidate?: unknown
  [key: string]: unknown
}

// ─── Helper ────────────────────────────────────────────────────────────────────

async function assertRoomMember(
  redis: Redis,
  roomId: string | undefined,
  userId: string,
): Promise<boolean> {
  if (!roomId || typeof roomId !== "string") return false
  const result = await redis.sismember(keys.roomUsers(roomId), userId)
  return result === 1
}

// ─── Gateway ───────────────────────────────────────────────────────────────────

export function buildSignalingGateway(
  io: Server,
  redis: Redis,
  sessionService: SessionService,
): void {
  io.on("connection", (socket: Socket) => {
    const { userId } = socket.data as SocketData

    // ─── join_room ─────────────────────────────────────────────────────────────
    //
    // Client emits this right after receiving match_found.
    // First joiner → stored as "caller" in Redis, waits silently.
    // Second joiner → server emits peer_joined to BOTH with their roles.
    //   caller  → should create the WebRTC offer
    //   receiver → waits for the offer

    socket.on("join_room", async (payload: JoinRoomPayload) => {
      try {
        const roomId = payload?.roomId

        if (!roomId) {
          socket.emit("error", { code: "BAD_REQUEST", message: "roomId is required" })
          return
        }

        // Validate that this user is actually a member of the room
        if (!(await assertRoomMember(redis, roomId, userId))) {
          socket.emit("error", {
            code: "NOT_IN_ROOM",
            message: "You are not a member of this room",
          })
          return
        }

        // Join the Socket.io room for this call
        socket.join(`room:${roomId}`)

        // Atomic SET NX — only one peer can claim "caller"; the other is "receiver"
        const claimed = await redis.set(keys.caller(roomId), userId, "EX", ROOM_TTL, "NX")

        if (claimed === "OK") {
          // First peer to join — we atomically claimed caller role, wait silently
          logger.debug(`Signaling: ${userId} joined room ${roomId} — waiting for peer`)
        } else {
          // Second peer joined — fetch caller and emit roles to both
          const existingCaller = await redis.get(keys.caller(roomId))
          if (existingCaller) {
            io.to(`user:${existingCaller}`).emit("peer_joined", { role: "caller", roomId })
            socket.emit("peer_joined", { role: "receiver", roomId })
            logger.info(
              `Signaling: room ready roomId=${roomId} caller=${existingCaller} receiver=${userId}`,
            )
          }
        }
      } catch (err) {
        logger.error("join_room error", { error: err, userId })
        socket.emit("error", { code: "INTERNAL_ERROR", message: "Something went wrong" })
      }
    })

    // ─── webrtc_offer ──────────────────────────────────────────────────────────
    //
    // Sent by the caller. Relay as-is to the other peer in the room.

    socket.on("webrtc_offer", async (payload: SignalPayload) => {
      try {
        const roomId = payload?.roomId as string
        if (!(await assertRoomMember(redis, roomId, userId))) return

        socket.to(`room:${roomId}`).emit("webrtc_offer", payload)
        logger.debug(`Signaling: offer relayed roomId=${roomId} from=${userId}`)
      } catch (err) {
        logger.error("webrtc_offer error", { error: err, userId })
      }
    })

    // ─── webrtc_answer ─────────────────────────────────────────────────────────
    //
    // Sent by the receiver in response to the offer. Relay to caller.

    socket.on("webrtc_answer", async (payload: SignalPayload) => {
      try {
        const roomId = payload?.roomId as string
        if (!(await assertRoomMember(redis, roomId, userId))) return

        socket.to(`room:${roomId}`).emit("webrtc_answer", payload)
        logger.debug(`Signaling: answer relayed roomId=${roomId} from=${userId}`)
      } catch (err) {
        logger.error("webrtc_answer error", { error: err, userId })
      }
    })

    // ─── webrtc_ice ────────────────────────────────────────────────────────────
    //
    // ICE candidates can be sent by either peer. Relay to the other.

    socket.on("webrtc_ice", async (payload: SignalPayload) => {
      try {
        const roomId = payload?.roomId as string
        if (!(await assertRoomMember(redis, roomId, userId))) return

        socket.to(`room:${roomId}`).emit("webrtc_ice", payload)
      } catch (err) {
        logger.error("webrtc_ice error", { error: err, userId })
      }
    })

    // ─── chat_message ──────────────────────────────────────────────────────────
    //
    // Either peer can send a text message during the call. Relay to other peer.

    socket.on(
      "chat_message",
      async (payload: { roomId: string; text: string; messageId: string }) => {
        try {
          const { roomId, text, messageId } = payload
          if (!roomId || typeof text !== "string" || !text.trim()) return
          if (!(await assertRoomMember(redis, roomId, userId))) return

          socket.to(`room:${roomId}`).emit("chat_message", {
            messageId: messageId ?? `${Date.now()}`,
            text: text.trim(),
          })
        } catch (err) {
          logger.error("chat_message error", { error: err, userId })
        }
      },
    )

    // ─── typing ────────────────────────────────────────────────────────────────
    //
    // Either peer can broadcast their typing state. Relay to the other peer.

    socket.on("typing", async (payload: { roomId: string; isTyping: boolean }) => {
      try {
        const { roomId, isTyping } = payload
        if (typeof roomId !== "string" || !roomId) return
        if (!(await assertRoomMember(redis, roomId, userId))) return
        socket.to(`room:${roomId}`).emit("typing", { isTyping })
      } catch (err) {
        logger.error("typing error", { error: err, userId })
      }
    })

    // ─── message_delivered ─────────────────────────────────────────────────────
    //
    // Sent by the receiver when they render a message. Relayed back to the
    // original sender so they can upgrade to double-tick.

    socket.on("message_delivered", async (payload: { roomId: string; messageId: string }) => {
      try {
        const { roomId, messageId } = payload
        if (!roomId || !messageId) return
        if (!(await assertRoomMember(redis, roomId, userId))) return
        socket.to(`room:${roomId}`).emit("message_delivered", { messageId })
      } catch (err) {
        logger.error("message_delivered error", { error: err, userId })
      }
    })

    // ─── end_call ──────────────────────────────────────────────────────────────
    //
    // Either peer can end the call. Notifies the other, then cleans up all
    // Redis keys for the room so both users can search again immediately.

    socket.on("end_call", async (payload: { roomId: string }) => {
      try {
        const roomId = payload?.roomId
        if (!(await assertRoomMember(redis, roomId, userId))) return

        // Notify the other peer first
        socket.to(`room:${roomId}`).emit("peer_left", { reason: "ended" })

        // End session record in DB (idempotent)
        sessionService
          .endSession(roomId, userId)
          .catch((err) => logger.error("endSession on end_call failed", { error: err, roomId }))

        // Clean up all Redis state for this room
        const members = await redis.smembers(keys.roomUsers(roomId))
        await Promise.all([
          redis.del(keys.roomUsers(roomId)),
          redis.del(keys.roomMeta(roomId)),
          redis.del(keys.caller(roomId)),
          ...members.map((id) => redis.del(keys.userRoom(id))),
        ])

        socket.leave(`room:${roomId}`)
        logger.info(`Call ended roomId=${roomId} by=${userId}`)
      } catch (err) {
        logger.error("end_call error", { error: err, userId })
        socket.emit("error", { code: "INTERNAL_ERROR", message: "Something went wrong" })
      }
    })
  })
}
