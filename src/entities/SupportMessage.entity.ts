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

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId!: string | null

  @Column({ name: "guest_email", type: "varchar", length: 255, nullable: true })
  guestEmail!: string | null

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null

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
