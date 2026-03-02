import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { EnglishLevel } from "../enums/index"

@Entity("onboarding_questions")
export class OnboardingQuestion {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ type: "text" })
  question!: string

  @Column({ type: "jsonb" })
  options!: string[] // 4 answer choices

  @Column({ name: "correct_index", type: "int" })
  correctIndex!: number // 0-3

  @Column({ name: "level_tag", type: "enum", enum: EnglishLevel })
  levelTag!: EnglishLevel // level this Q contributes to scoring

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder!: number

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date
}
