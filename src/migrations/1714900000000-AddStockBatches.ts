import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Batch/expiry tracking for stock. A stock_batches row per received lot carries
 * its expiry and remaining quantity; stock is consumed first-expiry-first-out.
 * Goods-receipt lines gain the batch/expiry captured at receiving. Idempotent.
 */
export class AddStockBatches1714900000000 implements MigrationInterface {
  name = 'AddStockBatches1714900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        item_id uuid NOT NULL,
        batch_no varchar(60),
        expiry_date date,
        qty_received numeric(14,3) NOT NULL,
        qty_remaining numeric(14,3) NOT NULL,
        unit_cost numeric(14,4) NOT NULL DEFAULT 0,
        received_at date NOT NULL,
        source_type varchar(60),
        source_id uuid,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_stock_batches_facility_item ON stock_batches (facility_id, item_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON stock_batches (facility_id, expiry_date)`,
    );

    await queryRunner.query(`ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS batch_no varchar(60)`);
    await queryRunner.query(`ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS expiry_date date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE goods_receipt_lines DROP COLUMN IF EXISTS expiry_date`);
    await queryRunner.query(`ALTER TABLE goods_receipt_lines DROP COLUMN IF EXISTS batch_no`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_batches`);
  }
}
