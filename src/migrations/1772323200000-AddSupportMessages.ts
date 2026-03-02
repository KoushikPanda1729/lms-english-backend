import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddSupportMessages1772323200000 implements MigrationInterface {
  name = "AddSupportMessages1772323200000"

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "support_messages" (
        "id"          uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"     uuid        NOT NULL,
        "from_admin"  boolean     NOT NULL DEFAULT false,
        "text"        text        NOT NULL,
        "read_at"     TIMESTAMP,
        "created_at"  TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_messages_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "IDX_support_messages_user_id" ON "support_messages" ("user_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_support_messages_created_at" ON "support_messages" ("created_at")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_support_messages_created_at"`)
    await queryRunner.query(`DROP INDEX "IDX_support_messages_user_id"`)
    await queryRunner.query(`DROP TABLE "support_messages"`)
  }
}
