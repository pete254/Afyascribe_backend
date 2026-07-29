import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Link a bill line to a stock item + quantity, so dispensing a drug/reagent
 * depletes inventory and books cost of sales alongside the revenue.
 * Idempotent (IF NOT EXISTS).
 */
export class AddBillingItemLink1713900000000 implements MigrationInterface {
  name = 'AddBillingItemLink1713900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE billing ADD COLUMN IF NOT EXISTS item_id uuid`);
    await queryRunner.query(`ALTER TABLE billing ADD COLUMN IF NOT EXISTS quantity numeric(14,3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE billing DROP COLUMN IF EXISTS quantity`);
    await queryRunner.query(`ALTER TABLE billing DROP COLUMN IF EXISTS item_id`);
  }
}
