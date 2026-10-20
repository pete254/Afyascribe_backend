import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sessions that have been signed out, so their tokens are refused before they
 * expire. Idempotent.
 */
export class AddRevokedSessions1762200000000 implements MigrationInterface {
  name = 'AddRevokedSessions1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "revoked_sessions" (
        "session_id" uuid NOT NULL,
        "user_id" uuid,
        "revoked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_revoked_sessions" PRIMARY KEY ("session_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_revoked_sessions_expires" ON "revoked_sessions" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "revoked_sessions"`);
  }
}
