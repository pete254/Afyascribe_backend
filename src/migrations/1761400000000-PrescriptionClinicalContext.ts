import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The clinical context a prescription was written from: the coded problems it
 * is for, the diagnostic tests that bear on it, and what the patient was
 * already taking. Idempotent.
 *
 * Until now a prescription carried only a free-text diagnosis, so a pharmacist
 * reviewing it — or a system receiving the FHIR — had a sentence where it
 * needed a coded condition, and no sight of the tests or the existing list.
 */
export class PrescriptionClinicalContext1761400000000 implements MigrationInterface {
  name = 'PrescriptionClinicalContext1761400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "problems" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "diagnostic_tests" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "medications_at_prescribing" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The columns are left in place: dropping them would destroy the clinical
    // context of every prescription already written against them.
  }
}
