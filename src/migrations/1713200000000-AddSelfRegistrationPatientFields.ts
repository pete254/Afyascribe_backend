// src/migrations/1713200000000-AddSelfRegistrationPatientFields.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings a self-registration up to the same field set as the mobile Onboard
 * Patient screen, so an approved submission carries everything the front desk
 * would otherwise have to re-ask for.
 *
 * Separate from the create-table migration so it applies cleanly whether or not
 * that one has already run in this environment. Every column is nullable and
 * added IF NOT EXISTS — nothing existing is touched.
 */
export class AddSelfRegistrationPatientFields1713200000000 implements MigrationInterface {
  name = 'AddSelfRegistrationPatientFields1713200000000';

  private static readonly TEXT_COLUMNS = [
    'title',
    'maritalStatus',
    'occupation',
    'idType',
    'nationality',
    'county',
    'subCounty',
    'postalCode',
    'howKnown',
    'patientType',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const col of AddSelfRegistrationPatientFields1713200000000.TEXT_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "self_registrations" ADD COLUMN IF NOT EXISTS "${col}" character varying`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "self_registrations" ADD COLUMN IF NOT EXISTS "nextOfKin" jsonb`,
    );

    console.log('✅ Migration complete: self_registrations now mirrors the patient onboarding form');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "self_registrations" DROP COLUMN IF EXISTS "nextOfKin"`);
    for (const col of AddSelfRegistrationPatientFields1713200000000.TEXT_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "self_registrations" DROP COLUMN IF EXISTS "${col}"`,
      );
    }
  }
}
