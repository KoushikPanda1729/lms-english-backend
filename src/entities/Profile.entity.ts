import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm"
import type { User } from "./User.entity"
import { EnglishLevel, LearningGoal } from "../enums/index"

@Entity("profiles")
export class Profile {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string

  @OneToOne("User", (user: User) => user.profile)
  @JoinColumn({ name: "user_id" })
  user!: User

  @Column({ nullable: true, type: "varchar", unique: true })
  username!: string | null

  @Column({ name: "display_name", nullable: true, type: "varchar" })
  displayName!: string | null

  @Column({ name: "avatar_url", nullable: true, type: "varchar" })
  avatarUrl!: string | null

  @Column({ nullable: true, type: "text" })
  bio!: string | null

  @Column({ name: "native_language", nullable: true, type: "varchar" })
  nativeLanguage!: string | null

  @Column({ name: "english_level", type: "enum", enum: EnglishLevel, nullable: true })
  englishLevel!: EnglishLevel | null

  @Column({ name: "learning_goal", type: "enum", enum: LearningGoal, nullable: true })
  learningGoal!: LearningGoal | null

  @Column({ nullable: true, type: "varchar" })
  country!: string | null

  @Column({ nullable: true, type: "varchar" })
  timezone!: string | null

  @Column({ name: "total_practice_mins", default: 0 })
  totalPracticeMins!: number

  @Column({ name: "total_sessions", default: 0 })
  totalSessions!: number

  @Column({ name: "streak_days", default: 0 })
  streakDays!: number

  @Column({ name: "last_session_at", nullable: true, type: "timestamp" })
  lastSessionAt!: Date | null

  @Column({ name: "onboarding_completed", type: "boolean", default: false })
  onboardingCompleted!: boolean

  @Column({ name: "last_active_at", type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  lastActiveAt!: Date

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date
}
