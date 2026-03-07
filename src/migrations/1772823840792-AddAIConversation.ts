import { MigrationInterface, QueryRunner } from "typeorm"

export class AddAIConversation1772823840792 implements MigrationInterface {
  name = "AddAIConversation1772823840792"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ai_personas_difficulty_enum" AS ENUM('beginner', 'intermediate', 'advanced')`,
    )
    await queryRunner.query(
      `CREATE TABLE "ai_personas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "avatar" character varying NOT NULL, "expertise" character varying NOT NULL, "description" text NOT NULL, "system_prompt" text NOT NULL, "difficulty" "public"."ai_personas_difficulty_enum" NOT NULL DEFAULT 'beginner', "is_premium" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "usage_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e0216e8fec1d47952f944ba865f" PRIMARY KEY ("id"))`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."ai_sessions_provider_enum" AS ENUM('openai', 'gemini')`,
    )
    await queryRunner.query(
      `CREATE TABLE "ai_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "persona_id" uuid, "provider" "public"."ai_sessions_provider_enum" NOT NULL DEFAULT 'openai', "ended_at" TIMESTAMP, "duration_seconds" integer, "started_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4a05e88d377dad1c58c3cb95c04" PRIMARY KEY ("id"))`,
    )
    await queryRunner.query(
      `ALTER TYPE "public"."device_tokens_platform_enum" RENAME TO "device_tokens_platform_enum_old"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."device_tokens_platform_enum" AS ENUM('ios', 'android', 'web')`,
    )
    await queryRunner.query(
      `ALTER TABLE "device_tokens" ALTER COLUMN "platform" TYPE "public"."device_tokens_platform_enum" USING "platform"::"text"::"public"."device_tokens_platform_enum"`,
    )
    await queryRunner.query(`DROP TYPE "public"."device_tokens_platform_enum_old"`)
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ADD CONSTRAINT "FK_c305f725faf61200f668e28f77d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ADD CONSTRAINT "FK_7c7964182e8da7e144a2b4cbc8f" FOREIGN KEY ("persona_id") REFERENCES "ai_personas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" DROP CONSTRAINT "FK_7c7964182e8da7e144a2b4cbc8f"`,
    )
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" DROP CONSTRAINT "FK_c305f725faf61200f668e28f77d"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."device_tokens_platform_enum_old" AS ENUM('ios', 'android', 'web')`,
    )
    await queryRunner.query(
      `ALTER TABLE "device_tokens" ALTER COLUMN "platform" TYPE "public"."device_tokens_platform_enum_old" USING "platform"::"text"::"public"."device_tokens_platform_enum_old"`,
    )
    await queryRunner.query(`DROP TYPE "public"."device_tokens_platform_enum"`)
    await queryRunner.query(
      `ALTER TYPE "public"."device_tokens_platform_enum_old" RENAME TO "device_tokens_platform_enum"`,
    )
    await queryRunner.query(`DROP TABLE "ai_sessions"`)
    await queryRunner.query(`DROP TYPE "public"."ai_sessions_provider_enum"`)
    await queryRunner.query(`DROP TABLE "ai_personas"`)
    await queryRunner.query(`DROP TYPE "public"."ai_personas_difficulty_enum"`)
  }
}
