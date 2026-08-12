import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-role support: a user can hold several roles at once. Adds a `roles`
 * jsonb array alongside the existing single `role` (which stays as the primary /
 * roles[0]). Backfills every existing user's roles to [role]. Idempotent.
 */
export class AddUserRoles1715200000000 implements MigrationInterface {
  name = 'AddUserRoles1715200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roles jsonb`);
    await queryRunner.query(
      `UPDATE users SET roles = to_jsonb(ARRAY[role::text]) WHERE roles IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS roles`);
  }
}
