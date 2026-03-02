import { MigrationInterface, QueryRunner } from "typeorm"

export class CreateOnboardingQuestions1772200000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Create the enum type for this table
    await queryRunner.query(`
      CREATE TYPE "onboarding_questions_level_tag_enum"
      AS ENUM ('beginner', 'elementary', 'intermediate', 'advanced')
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question" text NOT NULL,
        "options" jsonb NOT NULL,
        "correct_index" integer NOT NULL,
        "level_tag" "onboarding_questions_level_tag_enum" NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_onboarding_questions" PRIMARY KEY ("id")
      )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_questions"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "onboarding_questions_level_tag_enum"`)
  }
}
