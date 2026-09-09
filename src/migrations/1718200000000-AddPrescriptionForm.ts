import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dosage form (tablet, syrup, capsule, injection…) on a prescription line, so
 * the pharmacist can see and edit how a drug is taken. Idempotent.
 */
export class AddPrescriptionForm1718200000000 implements MigrationInterface {
  name = 'AddPrescriptionForm1718200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS form varchar(40)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE prescription_items DROP COLUMN IF EXISTS form`);
  }
}
