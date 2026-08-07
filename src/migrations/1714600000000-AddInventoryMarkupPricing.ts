import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Markup pricing for stock items. Each item gets a reference cost (kept in step
 * with the moving-average cost as stock is received) and an optional markup %;
 * when the markup is set, the sale price is derived automatically as
 * cost × (1 + markup/100). A facility-wide default markup pre-fills new items.
 * Idempotent.
 */
export class AddInventoryMarkupPricing1714600000000 implements MigrationInterface {
  name = 'AddInventoryMarkupPricing1714600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_price numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS markup_pct numeric(6,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS default_markup_pct numeric(6,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE facilities DROP COLUMN IF EXISTS default_markup_pct`);
    await queryRunner.query(`ALTER TABLE inventory_items DROP COLUMN IF EXISTS markup_pct`);
    await queryRunner.query(`ALTER TABLE inventory_items DROP COLUMN IF EXISTS cost_price`);
  }
}
