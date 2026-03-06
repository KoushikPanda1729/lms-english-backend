import { Repository } from "typeorm"
import { AdminActivity } from "../../entities/AdminActivity.entity"
import { AdminActivityType } from "../../enums/admin-activity-type.enum"

export class AdminActivityService {
  constructor(private readonly activityRepo: Repository<AdminActivity>) {}

  async record(
    type: AdminActivityType,
    title: string,
    body: string,
    data?: Record<string, string> | null,
  ): Promise<void> {
    const activity = this.activityRepo.create({
      type,
      title,
      body,
      data: data ?? null,
      seen: false,
    })
    await this.activityRepo.save(activity)
  }

  async getRecent(limit = 30): Promise<{
    activities: (AdminActivity & { displayTime: string })[]
    unseenCount: number
  }> {
    const [activities, unseenCount] = await Promise.all([
      this.activityRepo.find({
        order: { createdAt: "DESC" },
        take: limit,
      }),
      this.activityRepo.count({ where: { seen: false } }),
    ])

    const now = Date.now()

    const MONTHS = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // UTC+5:30

    const withDisplay = activities.map((a) => {
      const diff = now - a.createdAt.getTime()
      const mins = Math.floor(diff / 60_000)
      let timeAgo: string
      if (mins < 1) timeAgo = "just now"
      else if (mins < 60) timeAgo = `${mins}m ago`
      else if (mins < 1440) timeAgo = `${Math.floor(mins / 60)}h ago`
      else timeAgo = `${Math.floor(mins / 1440)}d ago`

      // Manually shift UTC → IST (avoids ICU/timezone issues in Node.js)
      const ist = new Date(a.createdAt.getTime() + IST_OFFSET_MS)
      const pad = (n: number) => n.toString().padStart(2, "0")
      const h = ist.getUTCHours()
      const ampm = h >= 12 ? "PM" : "AM"
      const h12 = h % 12 || 12
      const displayTime = `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${h12}:${pad(ist.getUTCMinutes())} ${ampm} IST`

      return { ...a, timeAgo, displayTime }
    })

    return { activities: withDisplay, unseenCount }
  }

  async markSeen(id: string): Promise<void> {
    await this.activityRepo.update({ id }, { seen: true })
  }

  async markAllSeen(): Promise<void> {
    await this.activityRepo.update({ seen: false }, { seen: true })
  }
}
