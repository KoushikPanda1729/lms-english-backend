import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm"
import { User } from "./User.entity"

@Entity("support_messages")
export class SupportMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ name: "user_id", type: "uuid" })
  userId!: string

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User

  /** true = sent by admin, false = sent by user */
  @Column({ name: "from_admin", default: false })
  fromAdmin!: boolean

  @Column({ type: "text" })
  text!: string

  /** Set when admin opens the conversation (marks user messages as read) */
  @Column({ name: "read_at", type: "timestamp", nullable: true })
  readAt!: Date | null

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date
}
