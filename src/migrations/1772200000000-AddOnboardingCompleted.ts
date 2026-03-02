import { MigrationInterface, QueryRunner } from "typeorm"

export class AddOnboardingCompleted1772200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Add elementary to english_level enum (TypeORM names it after the table)
    await queryRunner.query(
      `ALTER TYPE "profiles_english_level_enum" ADD VALUE IF NOT EXISTS 'elementary' AFTER 'beginner'`,
    )

    // Add onboarding_completed column to profiles
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean NOT NULL DEFAULT false`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN IF EXISTS "onboarding_completed"`)
    // Note: removing enum values in PostgreSQL requires recreating the type
  }
}
