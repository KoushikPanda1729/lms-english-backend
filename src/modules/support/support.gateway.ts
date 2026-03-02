import { Server, Socket } from "socket.io"
import { Repository } from "typeorm"
import { Profile } from "../../entities/Profile.entity"
import { SupportService } from "./support.service"
import logger from "../../config/logger"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SocketData {
  userId: string
  email: string
  role: string
}

const ADMIN_ROLES = ["admin", "super_admin", "moderator"]

// ─── Gateway ───────────────────────────────────────────────────────────────────

export function buildSupportGateway(
  io: Server,
  supportService: SupportService,
  profileRepo: Repository<Profile>,
): void {
  io.on("connection", (socket: Socket) => {
    const { userId, role } = socket.data as SocketData
    const isAdmin = ADMIN_ROLES.includes(role)

    // Admins automatically join the global support room so they receive
    // all new user messages while the support page is open.
    if (isAdmin) {
      socket.join("support:admin")
      logger.debug(`Admin ${userId} joined support:admin room`)
    }

    // ─── support_send (user → admin) ───────────────────────────────────────
    //
    // User sends a support message. Saved to DB and broadcast to all
    // admins currently online in the support:admin room.

    socket.on("support_send", async (payload: { text: string }) => {
      if (isAdmin) return // admins use admin_support_send
      try {
        const text = payload?.text?.trim()
        if (!text) return

        const msg = await supportService.saveMessage(userId, text, false)

        const profile = await profileRepo.findOne({ where: { userId } })
        const displayName = profile?.displayName || profile?.username || "User"
        const avatarUrl = profile?.avatarUrl || null

        // Notify admins
        io.to("support:admin").emit("support_new_message", {
          messageId: msg.id,
          userId,
          displayName,
          avatarUrl,
          text: msg.text,
          fromAdmin: false,
          createdAt: msg.createdAt,
        })

        // Confirm to sender
        socket.emit("support_sent", { messageId: msg.id, createdAt: msg.createdAt })
      } catch (err) {
        logger.error("support_send error", { error: err, userId })
      }
    })

    // ─── admin_support_join ────────────────────────────────────────────────
    //
    // Admin opens a user's chat thread. Joins the per-user room and marks
    // all that user's messages as read.

    socket.on("admin_support_join", async (payload: { userId: string }) => {
      if (!isAdmin) return
      try {
        const targetUserId = payload?.userId
        if (!targetUserId) return

        socket.join(`support:user:${targetUserId}`)
        await supportService.markMessagesRead(targetUserId)

        // Tell all admins the unread count for this user is now 0
        io.to("support:admin").emit("support_read", { userId: targetUserId })
        logger.debug(`Admin ${userId} joined support room for user ${targetUserId}`)
      } catch (err) {
        logger.error("admin_support_join error", { error: err, userId })
      }
    })

    // ─── admin_support_leave ───────────────────────────────────────────────

    socket.on("admin_support_leave", (payload: { userId: string }) => {
      if (!isAdmin) return
      const targetUserId = payload?.userId
      if (targetUserId) socket.leave(`support:user:${targetUserId}`)
    })

    // ─── admin_support_send (admin → user) ────────────────────────────────
    //
    // Admin sends a reply. Saved to DB, pushed to the user's personal room
    // (which user joined in matchmaking gateway) and to other admins watching.

    socket.on("admin_support_send", async (payload: { userId: string; text: string }) => {
      if (!isAdmin) return
      try {
        const { userId: targetUserId, text } = payload ?? {}
        if (!targetUserId || !text?.trim()) return

        const msg = await supportService.saveMessage(targetUserId, text.trim(), true)

        // Push to user (they are in `user:{userId}` room from matchmaking gateway)
        io.to(`user:${targetUserId}`).emit("support_reply", {
          messageId: msg.id,
          text: msg.text,
          fromAdmin: true,
          createdAt: msg.createdAt,
        })

        // Echo to other admins watching the same user's thread
        socket.to(`support:user:${targetUserId}`).emit("support_new_message", {
          messageId: msg.id,
          userId: targetUserId,
          text: msg.text,
          fromAdmin: true,
          createdAt: msg.createdAt,
        })

        // Confirm to sender
        socket.emit("support_sent", { messageId: msg.id, createdAt: msg.createdAt })
      } catch (err) {
        logger.error("admin_support_send error", { error: err, userId })
      }
    })
  })
}
