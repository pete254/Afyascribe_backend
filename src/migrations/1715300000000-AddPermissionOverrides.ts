import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user permission overrides: a jsonb map of capability key →
 * allow(true)/deny(false) that wins over what the user's roles grant. Lets an
 * owner tailor an individual's access function by function. Idempotent.
 */
export class AddPermissionOverrides1715300000000 implements MigrationInterface {
  name = 'AddPermissionOverrides1715300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_overrides jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS permission_overrides`);
  }
}
