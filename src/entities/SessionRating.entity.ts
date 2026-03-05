import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm"
import { User } from "./User.entity"
import { CallSession } from "./CallSession.entity"

@Unique(["sessionId", "raterId"])
@Entity("session_ratings")
export class SessionRating {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ name: "session_id", type: "uuid" })
  sessionId!: string

  @ManyToOne(() => CallSession)
  @JoinColumn({ name: "session_id" })
  session!: CallSession

  @Column({ name: "rater_id", type: "uuid" })
  raterId!: string

  @ManyToOne(() => User)
  @JoinColumn({ name: "rater_id" })
  rater!: User

  @Column({ name: "rated_id", type: "uuid" })
  ratedId!: string

  @ManyToOne(() => User)
  @JoinColumn({ name: "rated_id" })
  rated!: User

  // 1 to 5 stars
  @Column({ type: "smallint" })
  stars!: number

  @Column({ type: "varchar", length: 500, nullable: true })
  feedback!: string | null

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date
}
