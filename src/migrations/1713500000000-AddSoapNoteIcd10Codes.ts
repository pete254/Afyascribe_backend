import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A consultation can carry more than one diagnosis, so store the full set of
 * ICD-10 codes on the note as jsonb ({ code, description }[]). The legacy
 * single `icd10_code` / `icd10_description` columns stay and mirror the first
 * code, so the mobile app, receipts and reports keep working unchanged.
 *
 * Idempotent — safe to run more than once (migrationsRun applies on boot).
 */
export class AddSoapNoteIcd10Codes1713500000000 implements MigrationInterface {
  name = 'AddSoapNoteIcd10Codes1713500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "soap_notes" ADD COLUMN IF NOT EXISTS "icd10_codes" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "soap_notes" DROP COLUMN IF EXISTS "icd10_codes"`);
  }
}
