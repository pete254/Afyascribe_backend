import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inpatient nursing hub + running bill:
 *  - nursing_vitals + care_plan_entries — the two new kardex sections.
 *  - wards gain a bed-charge mode ('normal' auto / 'special' manual) + daily rate.
 *  - admissions gain deposit tracking + the bed-fee accrual watermark.
 *
 * The Patient Deposits ledger account (21012) is seeded per-facility from the
 * standard chart at runtime, so it needs no schema migration here.
 */
export class InpatientKardexRunningBill1716200000000 implements MigrationInterface {
  name = 'InpatientKardexRunningBill1716200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Vitals ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nursing_vitals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "admission_id" uuid,
        "temperature" numeric(4,1),
        "pulse" integer,
        "resp_rate" integer,
        "bp_systolic" integer,
        "bp_diastolic" integer,
        "spo2" integer,
        "weight_kg" numeric(5,1),
        "blood_glucose" numeric(5,1),
        "pain_score" integer,
        "notes" text,
        "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_vitals_facility_admission" ON "nursing_vitals" ("facility_id", "admission_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_vitals_facility_patient" ON "nursing_vitals" ("facility_id", "patient_id")`,
    );

    // ── Care plan ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "care_plan_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "admission_id" uuid,
        "problem" text NOT NULL,
        "goal" text,
        "intervention" text,
        "evaluation" text,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "created_by_id" uuid,
        "created_by_name" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_careplan_facility_admission" ON "care_plan_entries" ("facility_id", "admission_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_careplan_facility_patient" ON "care_plan_entries" ("facility_id", "patient_id")`,
    );

    // ── Ward bed charges ──────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "wards" ADD COLUMN IF NOT EXISTS "bed_charge_mode" varchar(16) NOT NULL DEFAULT 'normal'`,
    );
    await queryRunner.query(
      `ALTER TABLE "wards" ADD COLUMN IF NOT EXISTS "bed_daily_charge" numeric(12,2) NOT NULL DEFAULT 0`,
    );

    // ── Admission deposit / running bill ──────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "deposit_paid" numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "deposit_balance" numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "bed_charged_through" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "bed_charged_through"`);
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "deposit_balance"`);
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "deposit_paid"`);
    await queryRunner.query(`ALTER TABLE "wards" DROP COLUMN IF EXISTS "bed_daily_charge"`);
    await queryRunner.query(`ALTER TABLE "wards" DROP COLUMN IF EXISTS "bed_charge_mode"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "care_plan_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nursing_vitals"`);
  }
}
