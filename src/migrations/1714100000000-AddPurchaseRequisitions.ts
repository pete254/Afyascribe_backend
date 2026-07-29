import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Purchase Requisitions (PRs) — the internal request that starts the
 * procure-to-pay chain — plus a link from an LPO back to the requisition it
 * fulfils. Idempotent (IF NOT EXISTS).
 */
export class AddPurchaseRequisitions1714100000000 implements MigrationInterface {
  name = 'AddPurchaseRequisitions1714100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_requisitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        pr_no varchar(30) NOT NULL,
        department varchar,
        requested_by_name varchar,
        date date NOT NULL,
        needed_by date,
        status varchar(20) NOT NULL DEFAULT 'pending_approval',
        estimated_total numeric(14,2) NOT NULL DEFAULT 0,
        notes text,
        created_by_id uuid,
        approved_by_id uuid,
        approved_by_name varchar,
        approved_at timestamptz,
        decision_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_facility_status ON purchase_requisitions (facility_id, status);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        requisition_id uuid NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
        item_id uuid,
        description varchar NOT NULL,
        quantity numeric(14,3) NOT NULL,
        estimated_unit_price numeric(14,2) NOT NULL DEFAULT 0,
        purpose varchar
      );
    `);

    await queryRunner.query(
      `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_requisition_id uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE purchase_orders DROP COLUMN IF EXISTS purchase_requisition_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_requisition_lines;`);
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_requisitions;`);
  }
}
