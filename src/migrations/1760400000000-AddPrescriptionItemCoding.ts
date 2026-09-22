import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Code the prescription itself. Until now a line only became linked to the
 * national dictionary if a pharmacist happened to attach stock to it, so the
 * prescription a doctor wrote carried no code of its own. Idempotent.
 */
export class AddPrescriptionItemCoding1760400000000 implements MigrationInterface {
  name = 'AddPrescriptionItemCoding1760400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "prescription_items" ADD COLUMN IF NOT EXISTS "knhts_code" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "prescription_items" ADD COLUMN IF NOT EXISTS "dose_form" character varying(80)`);
    await queryRunner.query(`ALTER TABLE "prescription_items" ADD COLUMN IF NOT EXISTS "strength" character varying(60)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const c of ['strength', 'dose_form', 'knhts_code']) {
      await queryRunner.query(`ALTER TABLE "prescription_items" DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
