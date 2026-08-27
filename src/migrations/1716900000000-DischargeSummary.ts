import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Structured discharge-summary fields on an admission — the document a
 * discharged inpatient leaves with (final diagnosis, course in hospital,
 * condition at discharge, take-home meds, follow-up plan). The legacy
 * free-text `discharge_notes` column is kept.
 */
export class DischargeSummary1716900000000 implements MigrationInterface {
  name = 'DischargeSummary1716900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharge_diagnosis" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "course_in_hospital" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "condition_at_discharge" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "discharge_medications" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "admissions" ADD COLUMN IF NOT EXISTS "follow_up_plan" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "follow_up_plan"`);
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "discharge_medications"`);
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "condition_at_discharge"`);
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "course_in_hospital"`);
    await queryRunner.query(`ALTER TABLE "admissions" DROP COLUMN IF EXISTS "discharge_diagnosis"`);
  }
}
