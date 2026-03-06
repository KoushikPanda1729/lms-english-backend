import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm"
import { AdminActivityType } from "../enums/admin-activity-type.enum"

@Entity("admin_activities")
export class AdminActivity {
  @PrimaryGeneratedColumn("uuid")
  id!: string

  @Column({ type: "enum", enum: AdminActivityType })
  type!: AdminActivityType

  @Column({ type: "varchar" })
  title!: string

  @Column({ type: "text" })
  body!: string

  @Column({ type: "jsonb", nullable: true })
  data!: Record<string, string> | null

  @Column({ default: false })
  seen!: boolean

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date
}
