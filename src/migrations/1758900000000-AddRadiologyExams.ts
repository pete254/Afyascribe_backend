import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An imaging exam catalogue (radiology_exams) — the radiology counterpart of
 * lab_tests — so imaging studies can be picked from a standardized, LOINC-coded
 * national list. Idempotent.
 */
export class AddRadiologyExams1758900000000 implements MigrationInterface {
  name = 'AddRadiologyExams1758900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "radiology_exams" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "modality" character varying(60),
        "knhts_code" character varying(64),
        "loinc_code" character varying(32),
        "loinc_name" text,
        "price" numeric(14,2) NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_radiology_exams" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_radiology_exams_facility" ON "radiology_exams" ("facility_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "radiology_exams"`);
  }
}
