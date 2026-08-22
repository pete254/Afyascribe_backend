import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fixed-asset register + per-asset event ledger (custody, repairs, disposal). */
export class Assets1716400000000 implements MigrationInterface {
  name = 'Assets1716400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "asset_tag" character varying(40) NOT NULL,
        "name" character varying NOT NULL,
        "asset_type" character varying(40) NOT NULL DEFAULT 'equipment',
        "serial_number" character varying,
        "description" text,
        "purchase_date" date,
        "purchase_cost" numeric(14,2) NOT NULL DEFAULT 0,
        "salvage_value" numeric(14,2) NOT NULL DEFAULT 0,
        "depreciation_method" character varying(20) NOT NULL DEFAULT 'straight_line',
        "useful_life_years" numeric(6,2) NOT NULL DEFAULT 0,
        "status" character varying(20) NOT NULL DEFAULT 'in_use',
        "custodian" character varying,
        "location" character varying,
        "supplier" character varying,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_assets" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_assets_facility_status" ON "assets" ("facility_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "asset_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "asset_id" uuid NOT NULL,
        "type" character varying(24) NOT NULL,
        "date" date NOT NULL,
        "amount" numeric(14,2) NOT NULL DEFAULT 0,
        "from_custodian" character varying,
        "to_custodian" character varying,
        "note" text,
        "created_by_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_asset_events" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_asset_events_facility_asset_date" ON "asset_events" ("facility_id", "asset_id", "date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "asset_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assets"`);
  }
}
