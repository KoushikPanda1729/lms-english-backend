import { MigrationInterface, QueryRunner } from "typeorm"

export class GuestSupportMessages1772733646493 implements MigrationInterface {
  name = "GuestSupportMessages1772733646493"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD "guest_email" character varying(255)`,
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
      `ALTER TABLE "support_messages" DROP CONSTRAINT "FK_238f6d3183cd7c8f38622a1bad3"`,
    )
    await queryRunner.query(`ALTER TABLE "support_messages" ALTER COLUMN "user_id" DROP NOT NULL`)
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD CONSTRAINT "FK_238f6d3183cd7c8f38622a1bad3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_messages" DROP CONSTRAINT "FK_238f6d3183cd7c8f38622a1bad3"`,
    )
    await queryRunner.query(`ALTER TABLE "support_messages" ALTER COLUMN "user_id" SET NOT NULL`)
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD CONSTRAINT "FK_238f6d3183cd7c8f38622a1bad3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
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
    await queryRunner.query(`ALTER TABLE "support_messages" DROP COLUMN "guest_email"`)
  }
}
