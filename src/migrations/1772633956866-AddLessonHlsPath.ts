import { MigrationInterface, QueryRunner } from "typeorm"

export class AddLessonHlsPath1772633956866 implements MigrationInterface {
  name = "AddLessonHlsPath1772633956866"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_messages" DROP CONSTRAINT "FK_support_messages_user"`,
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_support_messages_user_id"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_support_messages_created_at"`)
    await queryRunner.query(`ALTER TABLE "lessons" ADD "hls_path" character varying`)
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
      `ALTER TYPE "public"."courses_level_enum" RENAME TO "courses_level_enum_old"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."courses_level_enum" AS ENUM('beginner', 'elementary', 'intermediate', 'advanced')`,
    )
    await queryRunner.query(
      `ALTER TABLE "courses" ALTER COLUMN "level" TYPE "public"."courses_level_enum" USING "level"::"text"::"public"."courses_level_enum"`,
    )
    await queryRunner.query(`DROP TYPE "public"."courses_level_enum_old"`)
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD CONSTRAINT "FK_238f6d3183cd7c8f38622a1bad3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_messages" DROP CONSTRAINT "FK_238f6d3183cd7c8f38622a1bad3"`,
    )
    await queryRunner.query(
      `CREATE TYPE "public"."courses_level_enum_old" AS ENUM('beginner', 'intermediate', 'advanced')`,
    )
    await queryRunner.query(
      `ALTER TABLE "courses" ALTER COLUMN "level" TYPE "public"."courses_level_enum_old" USING "level"::"text"::"public"."courses_level_enum_old"`,
    )
    await queryRunner.query(`DROP TYPE "public"."courses_level_enum"`)
    await queryRunner.query(
      `ALTER TYPE "public"."courses_level_enum_old" RENAME TO "courses_level_enum"`,
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
    await queryRunner.query(`ALTER TABLE "lessons" DROP COLUMN "hls_path"`)
    await queryRunner.query(
      `CREATE INDEX "IDX_support_messages_created_at" ON "support_messages" ("created_at") `,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_support_messages_user_id" ON "support_messages" ("user_id") `,
    )
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD CONSTRAINT "FK_support_messages_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )
  }
}
