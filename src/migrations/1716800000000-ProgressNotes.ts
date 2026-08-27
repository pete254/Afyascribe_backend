import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ward progress notes — free-text clinical notes tagged by author role, so the
 * kardex can show the doctor's ward-round notes and the nurses' notes side by
 * side alongside the structured care plan, vitals and MAR.
 */
export class ProgressNotes1716800000000 implements MigrationInterface {
  name = 'ProgressNotes1716800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "progress_notes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "admission_id" uuid,
        "author_role" character varying(10) NOT NULL,
        "body" text NOT NULL,
        "created_by_id" uuid,
        "created_by_name" character varying(160),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_progress_notes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_progress_notes_facility_patient" ON "progress_notes" ("facility_id", "patient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_progress_notes_facility_admission" ON "progress_notes" ("facility_id", "admission_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progress_notes_facility_admission"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_progress_notes_facility_patient"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "progress_notes"`);
  }
}
