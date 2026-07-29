import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Local Purchase Orders (LPOs) with an approval workflow, plus the facility
 * flag that lets an owner delegate LPO approval to the accountant.
 * Idempotent (IF NOT EXISTS).
 */
export class AddPurchaseOrders1714000000000 implements MigrationInterface {
  name = 'AddPurchaseOrders1714000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS accountant_can_approve_lpo boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        lpo_no varchar(30) NOT NULL,
        supplier_id uuid NOT NULL,
        date date NOT NULL,
        expected_date date,
        status varchar(20) NOT NULL DEFAULT 'pending_approval',
        subtotal numeric(14,2) NOT NULL DEFAULT 0,
        tax_rate numeric(5,2) NOT NULL DEFAULT 0,
        tax_amount numeric(14,2) NOT NULL DEFAULT 0,
        total numeric(14,2) NOT NULL DEFAULT 0,
        delivery_address text,
        terms text,
        notes text,
        created_by_id uuid,
        created_by_name varchar,
        approved_by_id uuid,
        approved_by_name varchar,
        approved_at timestamptz,
        decision_note text,
        goods_receipt_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_purchase_orders_facility_status ON purchase_orders (facility_id, status);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        item_id uuid,
        description varchar NOT NULL,
        quantity numeric(14,3) NOT NULL,
        unit_price numeric(14,2) NOT NULL,
        line_total numeric(14,2) NOT NULL
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_order_lines;`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_orders;`);
    await queryRunner.query(`ALTER TABLE facilities DROP COLUMN IF EXISTS accountant_can_approve_lpo`);
  }
}
