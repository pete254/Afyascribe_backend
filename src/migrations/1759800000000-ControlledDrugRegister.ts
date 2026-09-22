import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Controlled drugs (Cap 245): a schedule on the item and the register itself —
 * an append-only ledger of every movement of a controlled drug, with a running
 * balance and the signatures an inspection expects. Idempotent.
 */
export class ControlledDrugRegister1759800000000 implements MigrationInterface {
  name = 'ControlledDrugRegister1759800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "controlled_schedule" character varying(20)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "controlled_drug_register" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "item_name" character varying(200) NOT NULL,
        "schedule" character varying(20),
        "date" date NOT NULL,
        "type" character varying(20) NOT NULL,
        "qty_in" numeric(14,3) NOT NULL DEFAULT 0,
        "qty_out" numeric(14,3) NOT NULL DEFAULT 0,
        "balance" numeric(14,3) NOT NULL DEFAULT 0,
        "batch_no" character varying(60),
        "patient_name" character varying(200),
        "patient_no" character varying(60),
        "prescriber" character varying(200),
        "prescription_no" character varying(60),
        "handled_by_id" uuid,
        "handled_by_name" character varying(200),
        "witness_name" character varying(200),
        "reference" character varying,
        "note" text,
        "movement_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_controlled_drug_register" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cdr_facility_item_date" ON "controlled_drug_register" ("facility_id", "item_id", "date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "controlled_drug_register"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "controlled_schedule"`);
  }
}
