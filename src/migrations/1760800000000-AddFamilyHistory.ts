import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Family health history, held per relative so a mother with two conditions is
 * one relative with two conditions — the shape FHIR FamilyMemberHistory uses.
 * Idempotent.
 */
export class AddFamilyHistory1760800000000 implements MigrationInterface {
  name = 'AddFamilyHistory1760800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patient_family_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "relationship" character varying(20) NOT NULL,
        "name" character varying(200),
        "gender" character varying(20),
        "born_year" integer,
        "deceased" boolean NOT NULL DEFAULT false,
        "age_at_death" integer,
        "conditions" jsonb NOT NULL DEFAULT '[]',
        "status" character varying(24) NOT NULL DEFAULT 'partial',
        "note" text,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patient_family_history" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_family_history_patient" ON "patient_family_history" ("facility_id", "patient_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patient_family_history"`);
  }
}
