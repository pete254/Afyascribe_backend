import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hard-link a patient document to a specific radiology study (images / films),
 * mirroring the existing soap_note_id link. Idempotent.
 */
export class AddRadiologyDocumentLink1717800000000 implements MigrationInterface {
  name = 'AddRadiologyDocumentLink1717800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS radiology_id uuid`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_patient_documents_radiology ON patient_documents (radiology_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_patient_documents_radiology`);
    await queryRunner.query(`ALTER TABLE patient_documents DROP COLUMN IF EXISTS radiology_id`);
  }
}
