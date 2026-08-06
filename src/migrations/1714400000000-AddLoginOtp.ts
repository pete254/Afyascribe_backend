import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two-factor sign-in. A per-user 6-digit code is emailed after a correct
 * password and stays valid until midnight. Adds the code columns on users, a
 * per-facility opt-out, and a small platform_settings key/value store that
 * backs the super_admin global kill switch. Idempotent (IF NOT EXISTS).
 */
export class AddLoginOtp1714400000000 implements MigrationInterface {
  name = 'AddLoginOtp1714400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "loginCode" varchar(6)`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "loginCodeExpiresAt" timestamp`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "loginCodeAttempts" int NOT NULL DEFAULT 0`);
    await queryRunner.query(
      `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS login_otp_disabled boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS platform_settings ("key" varchar PRIMARY KEY, "value" varchar NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform_settings`);
    await queryRunner.query(`ALTER TABLE facilities DROP COLUMN IF EXISTS login_otp_disabled`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "loginCodeAttempts"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "loginCodeExpiresAt"`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "loginCode"`);
  }
}
