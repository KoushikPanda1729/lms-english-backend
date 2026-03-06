import { MigrationInterface, QueryRunner } from "typeorm"

export class AddAdminActivities1772768312154 implements MigrationInterface {
  name = "AddAdminActivities1772768312154"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."admin_activities_type_enum" AS ENUM('user_registered', 'course_purchased')`,
    )
    await queryRunner.query(
      `CREATE TABLE "admin_activities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."admin_activities_type_enum" NOT NULL, "title" character varying NOT NULL, "body" text NOT NULL, "data" jsonb, "seen" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_47782ed4a624c3edc04acd36a86" PRIMARY KEY ("id"))`,
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
    await queryRunner.query(`DROP TABLE "admin_activities"`)
    await queryRunner.query(`DROP TYPE "public"."admin_activities_type_enum"`)
  }
}
