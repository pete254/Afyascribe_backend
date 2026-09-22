import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A patient's allergy list and allergy history, coded to the national value
 * sets (and to HPT active components for drug allergies). Idempotent.
 */
export class AddPatientAllergies1760100000000 implements MigrationInterface {
  name = 'AddPatientAllergies1760100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patient_allergies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "allergen_type" character varying(20) NOT NULL DEFAULT 'medication',
        "allergen_name" character varying(200) NOT NULL,
        "knhts_code" character varying(64),
        "knhts_system" character varying(40),
        "hpt_code" character varying(64),
        "hpt_name" character varying(200),
        "kind" character varying(20) NOT NULL DEFAULT 'allergy',
        "manifestations" jsonb NOT NULL DEFAULT '[]',
        "severity" character varying(20),
        "criticality" character varying(24),
        "status" character varying(24) NOT NULL DEFAULT 'active',
        "verification_status" character varying(20) NOT NULL DEFAULT 'unconfirmed',
        "onset_date" date,
        "last_occurrence" date,
        "note" text,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "revisions" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patient_allergies" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_patient_allergies_patient" ON "patient_allergies" ("facility_id", "patient_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patient_allergies"`);
  }
}
