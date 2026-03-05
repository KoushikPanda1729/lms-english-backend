import { Repository, IsNull } from "typeorm"
import { AppDataSource } from "../../config/database.config"
import { SupportMessage } from "../../entities/SupportMessage.entity"

export class SupportService {
  constructor(private supportMessageRepo: Repository<SupportMessage>) {}

  // ─── Save a message ────────────────────────────────────────────────────────

  async saveMessage(userId: string, text: string, fromAdmin: boolean): Promise<SupportMessage> {
    const msg = this.supportMessageRepo.create({ userId, text, fromAdmin })
    return this.supportMessageRepo.save(msg)
  }

  async saveGuestMessage(guestEmail: string, text: string): Promise<SupportMessage> {
    const msg = this.supportMessageRepo.create({ userId: null, guestEmail, text, fromAdmin: false })
    return this.supportMessageRepo.save(msg)
  }

  // ─── Get all messages for a user (chronological) ──────────────────────────

  async getMessagesForUser(userId: string, limit = 100): Promise<SupportMessage[]> {
    // Guest conversations use the format "guest:email@example.com"
    if (userId.startsWith("guest:")) {
      const guestEmail = userId.slice("guest:".length)
      return this.supportMessageRepo.find({
        where: { guestEmail },
        order: { createdAt: "ASC" },
        take: limit,
      })
    }
    return this.supportMessageRepo.find({
      where: { userId },
      order: { createdAt: "ASC" },
      take: limit,
    })
  }

  // ─── List conversations (one entry per user who has ever messaged) ─────────
  // Returns sorted by most recent message, with unread count (fromAdmin=false + readAt=null)

  async listConversations(): Promise<
    Array<{
      userId: string
      displayName: string
      avatarUrl: string | null
      lastMessage: string
      lastMessageAt: Date
      unreadCount: number
      isBanned: boolean
    }>
  > {
    const rows = await AppDataSource.query(`
      SELECT
        COALESCE(sm.user_id::text, 'guest:' || sm.guest_email)                           AS "userId",
        COALESCE(p.display_name, p.username, sm.guest_email, 'Guest')                    AS "displayName",
        p.avatar_url                                                                       AS "avatarUrl",
        last_msg.text                                                                      AS "lastMessage",
        last_msg.created_at                                                                AS "lastMessageAt",
        COUNT(CASE WHEN sm.from_admin = false AND sm.read_at IS NULL THEN 1 END)::int     AS "unreadCount",
        COALESCE(u.is_banned, false)                                                      AS "isBanned",
        (sm.user_id IS NULL)                                                              AS "isGuest"
      FROM support_messages sm
      LEFT JOIN profiles p ON p.user_id = sm.user_id
      LEFT JOIN users u ON u.id = sm.user_id OR (sm.user_id IS NULL AND u.email = sm.guest_email)
      JOIN LATERAL (
        SELECT text, created_at
        FROM support_messages sm2
        WHERE COALESCE(sm2.user_id::text, 'guest:' || sm2.guest_email) = COALESCE(sm.user_id::text, 'guest:' || sm.guest_email)
        ORDER BY created_at DESC
        LIMIT 1
      ) last_msg ON true
      GROUP BY sm.user_id, sm.guest_email, p.display_name, p.username, p.avatar_url, last_msg.text, last_msg.created_at, u.is_banned, u.email
      ORDER BY last_msg.created_at DESC
    `)
    return rows
  }

  // ─── Total unread count across all users (for sidebar badge) ──────────────

  async getTotalUnreadCount(): Promise<number> {
    return this.supportMessageRepo.count({ where: { fromAdmin: false, readAt: IsNull() } })
  }

  // ─── Mark all user messages in a conversation as read ─────────────────────

  async markMessagesRead(userId: string): Promise<void> {
    if (userId.startsWith("guest:")) {
      const guestEmail = userId.slice("guest:".length)
      await this.supportMessageRepo.update(
        { guestEmail, fromAdmin: false, readAt: IsNull() },
        { readAt: new Date() },
      )
      return
    }
    await this.supportMessageRepo.update(
      { userId, fromAdmin: false, readAt: IsNull() },
      { readAt: new Date() },
    )
  }
}
