import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inventory + procurement: item master, moving-average stock ledger, suppliers,
 * goods receipts and supplier payments. Money is numeric(14,2), quantity
 * numeric(14,3), unit cost numeric(14,4). Idempotent (IF NOT EXISTS).
 */
export class AddInventoryProcurement1713700000000 implements MigrationInterface {
  name = 'AddInventoryProcurement1713700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        sku varchar(60),
        name varchar NOT NULL,
        category varchar(40) NOT NULL DEFAULT 'drug',
        unit varchar(20) NOT NULL DEFAULT 'unit',
        sale_price numeric(14,2) NOT NULL DEFAULT 0,
        reorder_level numeric(14,3) NOT NULL DEFAULT 0,
        track_stock boolean NOT NULL DEFAULT true,
        stock_qty numeric(14,3) NOT NULL DEFAULT 0,
        stock_value numeric(14,2) NOT NULL DEFAULT 0,
        inventory_account_code varchar(20) NOT NULL DEFAULT '13001',
        cogs_account_code varchar(20) NOT NULL DEFAULT '51001',
        revenue_account_code varchar(20) NOT NULL DEFAULT '42001',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_inventory_items_facility_sku ON inventory_items (facility_id, sku);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        name varchar NOT NULL,
        contact_person varchar,
        email varchar,
        phone varchar,
        tax_pin varchar(40),
        payable_account_code varchar(20) NOT NULL DEFAULT '21001',
        balance numeric(14,2) NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_suppliers_facility_name ON suppliers (facility_id, name);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        type varchar(20) NOT NULL,
        date date NOT NULL,
        quantity numeric(14,3) NOT NULL,
        unit_cost numeric(14,4) NOT NULL DEFAULT 0,
        value numeric(14,2) NOT NULL,
        balance_qty numeric(14,3) NOT NULL DEFAULT 0,
        balance_value numeric(14,2) NOT NULL DEFAULT 0,
        reference varchar,
        source_type varchar(60),
        source_id uuid,
        note text,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements (facility_id, item_id, created_at);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS goods_receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        grn_no varchar(30) NOT NULL,
        supplier_id uuid NOT NULL,
        date date NOT NULL,
        reference varchar,
        total_value numeric(14,2) NOT NULL DEFAULT 0,
        notes text,
        journal_entry_id uuid,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_goods_receipts_facility_date ON goods_receipts (facility_id, date);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS goods_receipt_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        goods_receipt_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
        item_id uuid NOT NULL,
        quantity numeric(14,3) NOT NULL,
        unit_cost numeric(14,4) NOT NULL,
        line_value numeric(14,2) NOT NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        payment_no varchar(30) NOT NULL,
        supplier_id uuid NOT NULL,
        date date NOT NULL,
        amount numeric(14,2) NOT NULL,
        method varchar(20) NOT NULL DEFAULT 'bank',
        bank_account_code varchar(20) NOT NULL DEFAULT '11003',
        reference varchar,
        notes text,
        journal_entry_id uuid,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_supplier_payments_facility_date ON supplier_payments (facility_id, date);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_payments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS goods_receipt_lines;`);
    await queryRunner.query(`DROP TABLE IF EXISTS goods_receipts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movements;`);
    await queryRunner.query(`DROP TABLE IF EXISTS suppliers;`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory_items;`);
  }
}
