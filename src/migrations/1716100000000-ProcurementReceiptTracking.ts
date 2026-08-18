import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Procurement-driven stock entry:
 *  - facilities.stock_direct_entry — direct add vs procurement-only posture.
 *  - requisition/PO lines carry category + unit so a received line can create
 *    its stock item.
 *  - PO lines track received_qty for partial receipts (PO status gains
 *    'partially_received', which is just a varchar value — no schema change).
 */
export class ProcurementReceiptTracking1716100000000 implements MigrationInterface {
  name = 'ProcurementReceiptTracking1716100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "stock_direct_entry" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_requisition_lines" ADD COLUMN IF NOT EXISTS "category" varchar(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_requisition_lines" ADD COLUMN IF NOT EXISTS "unit" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "category" varchar(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "unit" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "received_qty" numeric(14,3) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN IF EXISTS "received_qty"`);
    await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN IF EXISTS "unit"`);
    await queryRunner.query(`ALTER TABLE "purchase_order_lines" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`ALTER TABLE "purchase_requisition_lines" DROP COLUMN IF EXISTS "unit"`);
    await queryRunner.query(`ALTER TABLE "purchase_requisition_lines" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`ALTER TABLE "facilities" DROP COLUMN IF EXISTS "stock_direct_entry"`);
  }
}
