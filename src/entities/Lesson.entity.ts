import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from "typeorm"
import { LessonType } from "../enums/index"
import type { Course } from "./Course.entity"
import type { Quiz } from "./Quiz.entity"

@Entity("lessons")
export class Lesson {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ name: "course_id", type: "uuid" })
  courseId!: string

  @ManyToOne("Course", (course: Course) => course.lessons, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id" })
  course!: Course

  @Column({ type: "varchar" })
  title!: string

  @Column({ type: "enum", enum: LessonType, default: LessonType.TEXT })
  type!: LessonType

  @Column({ type: "text", nullable: true })
  content!: string | null

  @Column({ name: "video_url", type: "varchar", nullable: true })
  videoUrl!: string | null

  @Column({ name: "pdf_url", type: "varchar", nullable: true })
  pdfUrl!: string | null

  @Column({ name: "hls_path", type: "varchar", nullable: true })
  hlsPath!: string | null

  @Column({ name: "order", type: "integer", default: 0 })
  order!: number

  @Column({ name: "duration_minutes", type: "integer", nullable: true })
  durationMinutes!: number | null

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date

  @OneToOne("Quiz", (quiz: Quiz) => quiz.lesson)
  quiz!: Quiz | null
}
