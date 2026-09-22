import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The patient problem list — conditions held over time, coded to ICD-11, with
 * the status changes kept as history. Until now a diagnosis existed only on the
 * consultation note that recorded it, so there was no list to read, update or
 * resolve. Idempotent.
 */
export class AddPatientProblems1760500000000 implements MigrationInterface {
  name = 'AddPatientProblems1760500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patient_problems" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "code" character varying(32),
        "system" character varying(40) NOT NULL DEFAULT 'ICD-11',
        "display" character varying(300) NOT NULL,
        "status" character varying(24) NOT NULL DEFAULT 'active',
        "verification_status" character varying(24) NOT NULL DEFAULT 'confirmed',
        "category" character varying(24) NOT NULL DEFAULT 'problem-list-item',
        "severity" character varying(16),
        "onset_date" date,
        "abatement_date" date,
        "note" text,
        "source_note_id" uuid,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "revisions" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patient_problems" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_patient_problems_patient" ON "patient_problems" ("facility_id", "patient_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patient_problems"`);
  }
}
