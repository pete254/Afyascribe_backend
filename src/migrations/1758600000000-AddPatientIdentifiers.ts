import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A dedicated SHA (Social Health Authority) beneficiary / UHID number on the
 * patient, for DHA/SHA interoperability. The identifier type for the national
 * ID already exists (patients.idType). Idempotent.
 */
export class AddPatientIdentifiers1758600000000 implements MigrationInterface {
  name = 'AddPatientIdentifiers1758600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "sha_number" character varying(60)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN IF EXISTS "sha_number"`);
  }
}
