import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supplier quotations (procure-to-pay step 3) and a link from an LPO to the
 * selected quotation. Idempotent (IF NOT EXISTS).
 */
export class AddQuotations1714200000000 implements MigrationInterface {
  name = 'AddQuotations1714200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        quote_no varchar(30) NOT NULL,
        supplier_id uuid NOT NULL,
        purchase_requisition_id uuid,
        supplier_ref varchar,
        date date NOT NULL,
        valid_until date,
        status varchar(12) NOT NULL DEFAULT 'received',
        subtotal numeric(14,2) NOT NULL DEFAULT 0,
        tax_rate numeric(5,2) NOT NULL DEFAULT 0,
        tax_amount numeric(14,2) NOT NULL DEFAULT 0,
        total numeric(14,2) NOT NULL DEFAULT 0,
        notes text,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_quotations_facility_pr ON quotations (facility_id, purchase_requisition_id);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS quotation_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        item_id uuid,
        description varchar NOT NULL,
        quantity numeric(14,3) NOT NULL,
        unit_price numeric(14,2) NOT NULL,
        line_total numeric(14,2) NOT NULL
      );
    `);

    await queryRunner.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quotation_id uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE purchase_orders DROP COLUMN IF EXISTS quotation_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS quotation_lines;`);
    await queryRunner.query(`DROP TABLE IF EXISTS quotations;`);
  }
}
