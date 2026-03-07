import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm"
import { User } from "./User.entity"
import { AIPersona } from "./AIPersona.entity"
import { AIProvider } from "../enums/ai-provider.enum"

@Entity("ai_sessions")
export class AISession {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ name: "user_id", type: "uuid" })
  userId!: string

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User

  @Column({ name: "persona_id", type: "uuid", nullable: true })
  personaId!: string | null

  @ManyToOne(() => AIPersona, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "persona_id" })
  persona!: AIPersona | null

  @Column({
    type: "enum",
    enum: AIProvider,
    default: AIProvider.OPENAI,
  })
  provider!: AIProvider

  @Column({ name: "ended_at", type: "timestamp", nullable: true })
  endedAt!: Date | null

  @Column({ name: "duration_seconds", type: "int", nullable: true })
  durationSeconds!: number | null

  @CreateDateColumn({ name: "started_at" })
  startedAt!: Date
}
