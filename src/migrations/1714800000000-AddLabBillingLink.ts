import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Link each lab test item to the bill it raised, so a charge can be traced back
 * to its test (and removed if the test is cancelled before payment). Idempotent.
 */
export class AddLabBillingLink1714800000000 implements MigrationInterface {
  name = 'AddLabBillingLink1714800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE lab_order_items ADD COLUMN IF NOT EXISTS billing_id uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE lab_order_items DROP COLUMN IF EXISTS billing_id`);
  }
}
