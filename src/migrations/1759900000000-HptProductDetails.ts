import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bind stock items to the national HPT dictionary properly: which tier the code
 * belongs to, plus the coded detail KNHTS carries (ATC, dose form, route,
 * strength, parent generic / active component, PPB registration). Idempotent.
 */
export class HptProductDetails1759900000000 implements MigrationInterface {
  name = 'HptProductDetails1759900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: [string, string][] = [
      ['hpt_tier', 'character varying(20)'],
      ['atc_code', 'character varying(20)'],
      ['dose_form_code', 'character varying(30)'],
      ['route_code', 'character varying(30)'],
      ['strength', 'character varying(60)'],
      ['generic_code', 'character varying(64)'],
      ['active_component_code', 'character varying(64)'],
      ['ppb_registration_code', 'character varying(60)'],
    ];
    for (const [name, type] of cols) {
      await queryRunner.query(`ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "${name}" ${type}`);
    }
    // Backfill the tier for codes already imported, so the cleanup can find the
    // reference data that was mistakenly imported as stock.
    await queryRunner.query(`UPDATE "inventory_items" SET hpt_tier = 'generic'   WHERE knhts_code LIKE 'GE%' AND hpt_tier IS NULL`);
    await queryRunner.query(`UPDATE "inventory_items" SET hpt_tier = 'brand'     WHERE knhts_code LIKE 'FS%' AND hpt_tier IS NULL`);
    await queryRunner.query(`UPDATE "inventory_items" SET hpt_tier = 'product'   WHERE knhts_code LIKE 'PH%' AND hpt_tier IS NULL`);
    await queryRunner.query(`UPDATE "inventory_items" SET hpt_tier = 'component' WHERE knhts_code LIKE 'AC%' AND hpt_tier IS NULL`);
    await queryRunner.query(
      `UPDATE "inventory_items" SET hpt_tier = 'reference' WHERE knhts_code IS NOT NULL AND hpt_tier IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_items_hpt_tier" ON "inventory_items" ("facility_id", "hpt_tier")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_items_hpt_tier"`);
    for (const name of [
      'ppb_registration_code',
      'active_component_code',
      'generic_code',
      'strength',
      'route_code',
      'dose_form_code',
      'atc_code',
      'hpt_tier',
    ]) {
      await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "${name}"`);
    }
  }
}
