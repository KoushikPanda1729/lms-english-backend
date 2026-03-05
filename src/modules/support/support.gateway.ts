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
  isBanned?: boolean
}

const ADMIN_ROLES = ["admin", "super_admin", "moderator"]

// ─── Module-level online state (single-server deployment) ───────────────────
// Tracks which non-admin users are currently connected and how many
// admin sockets are online so we can broadcast status changes.

const onlineUsers = new Set<string>() // non-admin userIds
let adminCount = 0

// ─── Gateway ───────────────────────────────────────────────────────────────────

export function buildSupportGateway(
  io: Server,
  supportService: SupportService,
  profileRepo: Repository<Profile>,
): void {
  io.on("connection", (socket: Socket) => {
    const { userId, role, isBanned } = socket.data as SocketData
    const isAdmin = ADMIN_ROLES.includes(role)

    // ── Online tracking ───────────────────────────────────────────────────

    if (isAdmin) {
      adminCount++
      socket.join("support:admin")
      logger.debug(`Admin ${userId} joined support:admin room (adminCount=${adminCount})`)

      // Send current online user list to this newly connected admin
      socket.emit("support_initial_online_users", { userIds: Array.from(onlineUsers) })

      // Tell all connected users that an admin is now online
      if (adminCount === 1) {
        io.emit("support_admin_online", { online: true })
      }
    } else {
      onlineUsers.add(userId)
      io.to("support:admin").emit("support_user_status", { userId, online: true })
      logger.debug(`User ${userId} is online for support`)
    }

    // ── support_status_check (user → ask if admin is online) ─────────────

    socket.on("support_status_check", () => {
      if (!isAdmin) {
        socket.emit("support_admin_status", { online: adminCount > 0 })
      }
    })

    // ── Disconnect ────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      if (isAdmin) {
        adminCount = Math.max(0, adminCount - 1)
        logger.debug(`Admin ${userId} disconnected (adminCount=${adminCount})`)
        if (adminCount === 0) {
          io.emit("support_admin_online", { online: false })
        }
      } else {
        onlineUsers.delete(userId)
        io.to("support:admin").emit("support_user_status", { userId, online: false })
        logger.debug(`User ${userId} went offline for support`)
      }
    })

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

        // Check if an admin is actively watching this user's thread
        const watchingAdmins = io.sockets.adapter.rooms.get(`support:user:${userId}`)?.size ?? 0

        if (watchingAdmins > 0) {
          // Auto-mark as read since admin is looking at the thread
          await supportService.markMessagesRead(userId)
          io.to("support:admin").emit("support_read", { userId })
          // Tell user their message was instantly read (blue ticks)
          socket.emit("support_read_by_admin", { userId })
        }

        // Notify admins of the new message
        io.to("support:admin").emit("support_new_message", {
          messageId: msg.id,
          userId,
          displayName,
          avatarUrl,
          isBanned: isBanned || false,
          text: msg.text,
          fromAdmin: false,
          createdAt: msg.createdAt,
        })

        // Confirm to sender (single tick → sent)
        socket.emit("support_sent", { messageId: msg.id, createdAt: msg.createdAt })
      } catch (err) {
        logger.error("support_send error", { error: err, userId })
      }
    })

    // ─── support_typing (user → admin) ────────────────────────────────────

    socket.on("support_typing", (payload: { typing: boolean }) => {
      if (isAdmin) return
      io.to("support:admin").emit("support_user_typing", {
        userId,
        typing: payload?.typing ?? false,
      })
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

        // Tell the user their messages have been read (enables blue double tick)
        io.to(`user:${targetUserId}`).emit("support_read_by_admin", { userId: targetUserId })

        // Tell this admin whether the user is currently online
        socket.emit("support_user_status", {
          userId: targetUserId,
          online: onlineUsers.has(targetUserId),
        })

        logger.debug(`Admin ${userId} joined support room for user ${targetUserId}`)
      } catch (err) {
        logger.error("admin_support_join error", { error: err, userId })
      }
    })

    // ─── admin_support_leave ───────────────────────────────────────────────

    socket.on("admin_support_leave", (payload: { userId: string }) => {
      if (!isAdmin) return
      const targetUserId = payload?.userId
      if (targetUserId) {
        socket.leave(`support:user:${targetUserId}`)
        // Stop typing indicator for this user
        io.to(`user:${targetUserId}`).emit("support_admin_typing", { typing: false })
      }
    })

    // ─── admin_support_typing (admin → user) ──────────────────────────────

    socket.on("admin_support_typing", (payload: { userId: string; typing: boolean }) => {
      if (!isAdmin) return
      const targetUserId = payload?.userId
      if (!targetUserId) return
      io.to(`user:${targetUserId}`).emit("support_admin_typing", {
        typing: payload?.typing ?? false,
      })
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

        // Stop typing indicator
        io.to(`user:${targetUserId}`).emit("support_admin_typing", { typing: false })

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
