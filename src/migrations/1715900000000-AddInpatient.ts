import { MigrationInterface, QueryRunner } from 'typeorm';

/** Inpatient module — wards, beds and admissions (MOH 328 bed return + 717). */
export class AddInpatient1715900000000 implements MigrationInterface {
  name = 'AddInpatient1715900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "ward_type" varchar(32) NOT NULL DEFAULT 'general',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_wards_facility" ON "wards" ("facility_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "beds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "ward_id" uuid NOT NULL,
        "label" varchar(40) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'available',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_beds_facility_ward" ON "beds" ("facility_id", "ward_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "admission_no" varchar(30),
        "patient_id" uuid NOT NULL,
        "ward_id" uuid NOT NULL,
        "bed_id" uuid,
        "visit_id" uuid,
        "admitted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "admitted_by_id" uuid,
        "admission_diagnosis" text,
        "status" varchar(20) NOT NULL DEFAULT 'admitted',
        "discharged_at" TIMESTAMP WITH TIME ZONE,
        "outcome" varchar(20),
        "discharge_notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_adm_facility_status" ON "admissions" ("facility_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_adm_facility_patient" ON "admissions" ("facility_id", "patient_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "beds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wards"`);
  }
}
