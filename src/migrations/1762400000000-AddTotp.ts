import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Authenticator-app second factor (TOTP): a sealed secret, the last time step
 * accepted, hashed backup codes, and a lock after repeated wrong codes.
 * Idempotent.
 */
export class AddTotp1762400000000 implements MigrationInterface {
  name = 'AddTotp1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const col of [
      '"totp_secret" text',
      '"totp_pending_secret" text',
      '"totp_enabled_at" TIMESTAMP WITH TIME ZONE',
      '"totp_last_step" integer',
      '"totp_backup_codes" jsonb',
      '"totp_failed_attempts" integer NOT NULL DEFAULT 0',
      '"totp_locked_until" TIMESTAMP WITH TIME ZONE',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS ${col}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of [
      'totp_secret',
      'totp_pending_secret',
      'totp_enabled_at',
      'totp_last_step',
      'totp_backup_codes',
      'totp_failed_attempts',
      'totp_locked_until',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "users" DROP COLUMN IF EXISTS "${col}"`,
      );
    }
  }
}
