import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Billing for radiology: a price charged per study, the visit the charge hangs
 * on, and the raised bill's id. Idempotent.
 */
export class AddRadiologyBilling1717600000000 implements MigrationInterface {
  name = 'AddRadiologyBilling1717600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS price numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS visit_id uuid`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS billing_id uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE radiology DROP COLUMN IF EXISTS billing_id`);
    await queryRunner.query(`ALTER TABLE radiology DROP COLUMN IF EXISTS visit_id`);
    await queryRunner.query(`ALTER TABLE radiology DROP COLUMN IF EXISTS price`);
  }
}
