import { MigrationInterface, QueryRunner } from "typeorm"

export class AddFeedbackToSessionRatings1772688207556 implements MigrationInterface {
  name = "AddFeedbackToSessionRatings1772688207556"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "session_ratings" ADD "feedback" character varying(500)`)
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`ALTER TABLE "session_ratings" DROP COLUMN "feedback"`)
  }
}
