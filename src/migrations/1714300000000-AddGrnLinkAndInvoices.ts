import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Procure-to-pay steps 5–8: link a goods receipt to its LPO, add supplier
 * invoices (3-way match record), and link a supplier payment to the invoice it
 * settles. Idempotent (IF NOT EXISTS).
 */
export class AddGrnLinkAndInvoices1714300000000 implements MigrationInterface {
  name = 'AddGrnLinkAndInvoices1714300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS purchase_order_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS supplier_invoice_id uuid`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supplier_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        invoice_no varchar(30) NOT NULL,
        supplier_invoice_no varchar,
        supplier_id uuid NOT NULL,
        purchase_order_id uuid,
        goods_receipt_id uuid,
        date date NOT NULL,
        due_date date,
        total numeric(14,2) NOT NULL DEFAULT 0,
        amount_paid numeric(14,2) NOT NULL DEFAULT 0,
        status varchar(10) NOT NULL DEFAULT 'unpaid',
        notes text,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_supplier_invoices_facility_supplier ON supplier_invoices (facility_id, supplier_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_invoices;`);
    await queryRunner.query(`ALTER TABLE supplier_payments DROP COLUMN IF EXISTS supplier_invoice_id`);
    await queryRunner.query(`ALTER TABLE goods_receipts DROP COLUMN IF EXISTS purchase_order_id`);
  }
}
