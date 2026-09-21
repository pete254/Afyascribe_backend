import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Three stores in one stock table: item_class (pharmacy | medical | general),
 * derived from each item's category. New general-store categories (cleaning,
 * stationery, linen, kitchen, fuel, maintenance) are expensed on issue.
 * Idempotent.
 */
export class InventoryItemClass1759600000000 implements MigrationInterface {
  name = 'InventoryItemClass1759600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "item_class" character varying(20) NOT NULL DEFAULT 'pharmacy'`);
    await queryRunner.query(`UPDATE "inventory_items" SET item_class = 'pharmacy' WHERE category IN ('drug', 'vaccine')`);
    await queryRunner.query(`UPDATE "inventory_items" SET item_class = 'medical' WHERE category IN ('consumable', 'reagent', 'surgical', 'radiology', 'dental', 'other')`);
    await queryRunner.query(`UPDATE "inventory_items" SET item_class = 'general' WHERE category IN ('cleaning', 'stationery', 'linen', 'kitchen', 'fuel', 'maintenance')`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_inventory_items_class" ON "inventory_items" ("facility_id", "item_class")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_items_class"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "item_class"`);
  }
}
