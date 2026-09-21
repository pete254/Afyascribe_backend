import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Store issues carry their department (for consumption by department), and a
 * goods receipt can carry capital lines that create asset-register entries
 * instead of stock. Idempotent.
 */
export class StoreIssuesAndAssetReceipts1759700000000 implements MigrationInterface {
  name = 'StoreIssuesAndAssetReceipts1759700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "department" character varying(60)`);
    await queryRunner.query(`ALTER TABLE "goods_receipt_lines" ALTER COLUMN "item_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "description" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "goods_receipt_lines" ADD COLUMN IF NOT EXISTS "asset_ids" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "goods_receipt_lines" DROP COLUMN IF EXISTS "asset_ids"`);
    await queryRunner.query(`ALTER TABLE "goods_receipt_lines" DROP COLUMN IF EXISTS "description"`);
    await queryRunner.query(`ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "department"`);
  }
}
