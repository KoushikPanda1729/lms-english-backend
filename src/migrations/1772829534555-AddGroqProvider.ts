import { MigrationInterface, QueryRunner } from "typeorm"

export class AddGroqProvider1772829534555 implements MigrationInterface {
  name = "AddGroqProvider1772829534555"

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      `ALTER TYPE "public"."ai_sessions_provider_enum" RENAME TO "ai_sessions_provider_enum_old"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."ai_sessions_provider_enum" AS ENUM('openai', 'gemini', 'groq')`,
    )
    await queryRunner.query(`ALTER TABLE "ai_sessions" ALTER COLUMN "provider" DROP DEFAULT`)
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ALTER COLUMN "provider" TYPE "public"."ai_sessions_provider_enum" USING "provider"::"text"::"public"."ai_sessions_provider_enum"`,
    )
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ALTER COLUMN "provider" SET DEFAULT 'openai'`,
    )
    await queryRunner.query(`DROP TYPE "public"."ai_sessions_provider_enum_old"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ai_sessions_provider_enum_old" AS ENUM('openai', 'gemini')`,
    )
    await queryRunner.query(`ALTER TABLE "ai_sessions" ALTER COLUMN "provider" DROP DEFAULT`)
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ALTER COLUMN "provider" TYPE "public"."ai_sessions_provider_enum_old" USING "provider"::"text"::"public"."ai_sessions_provider_enum_old"`,
    )
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ALTER COLUMN "provider" SET DEFAULT 'openai'`,
    )
    await queryRunner.query(`DROP TYPE "public"."ai_sessions_provider_enum"`)
    await queryRunner.query(
      `ALTER TYPE "public"."ai_sessions_provider_enum_old" RENAME TO "ai_sessions_provider_enum"`,
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
  }
}
