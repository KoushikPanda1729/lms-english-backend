import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

export type AIPersonaDifficulty = "beginner" | "intermediate" | "advanced"

@Entity("ai_personas")
export class AIPersona {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ type: "varchar" })
  name!: string // e.g. "Casual Charlie"

  @Column({ type: "varchar" })
  avatar!: string // emoji or image URL

  @Column({ type: "varchar" })
  expertise!: string // e.g. "Everyday Conversation"

  @Column({ type: "text" })
  description!: string // short user-facing description

  @Column({ name: "system_prompt", type: "text" })
  systemPrompt!: string // sent to LLM as system instruction

  @Column({
    type: "enum",
    enum: ["beginner", "intermediate", "advanced"],
    default: "beginner",
  })
  difficulty!: AIPersonaDifficulty

  @Column({ name: "is_premium", default: false })
  isPremium!: boolean

  @Column({ name: "is_active", default: true })
  isActive!: boolean

  @Column({ name: "sort_order", default: 0 })
  sortOrder!: number

  @Column({ name: "usage_count", default: 0 })
  usageCount!: number

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date
}
