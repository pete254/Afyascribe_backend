import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registers the `radiographer` role on the existing users_role_enum so imaging
 * staff can be created and sign in. PG 12+ allows ADD VALUE; idempotent.
 * (Postgres cannot ADD VALUE inside a transaction, so this runs unwrapped.)
 */
export class AddRadiographerRole1717500000000 implements MigrationInterface {
  name = 'AddRadiographerRole1717500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'radiographer'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres has no safe DROP VALUE for an enum; leaving the value in place is
    // harmless. No-op.
  }
}
