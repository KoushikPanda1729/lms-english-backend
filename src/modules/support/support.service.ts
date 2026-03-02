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

  // ─── Get all messages for a user (chronological) ──────────────────────────

  async getMessagesForUser(userId: string, limit = 100): Promise<SupportMessage[]> {
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
    }>
  > {
    const rows = await AppDataSource.query(`
      SELECT
        sm.user_id                                                                         AS "userId",
        COALESCE(p.display_name, p.username, 'User')                                      AS "displayName",
        p.avatar_url                                                                       AS "avatarUrl",
        last_msg.text                                                                      AS "lastMessage",
        last_msg.created_at                                                                AS "lastMessageAt",
        COUNT(CASE WHEN sm.from_admin = false AND sm.read_at IS NULL THEN 1 END)::int     AS "unreadCount"
      FROM support_messages sm
      JOIN profiles p ON p.user_id = sm.user_id
      JOIN LATERAL (
        SELECT text, created_at
        FROM support_messages
        WHERE user_id = sm.user_id
        ORDER BY created_at DESC
        LIMIT 1
      ) last_msg ON true
      GROUP BY sm.user_id, p.display_name, p.username, p.avatar_url, last_msg.text, last_msg.created_at
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
    await this.supportMessageRepo.update(
      { userId, fromAdmin: false, readAt: IsNull() },
      { readAt: new Date() },
    )
  }
}
