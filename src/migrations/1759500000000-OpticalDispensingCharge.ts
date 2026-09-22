import { MigrationInterface, QueryRunner } from 'typeorm';

/** Frame + lens prices on an optical record, billed as one charge at dispensing. */
export class OpticalDispensingCharge1759500000000 implements MigrationInterface {
  name = 'OpticalDispensingCharge1759500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "optical_prescriptions" ADD COLUMN IF NOT EXISTS "frame_price" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "optical_prescriptions" ADD COLUMN IF NOT EXISTS "lens_price" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "optical_prescriptions" ADD COLUMN IF NOT EXISTS "dispense_billing_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "optical_prescriptions" DROP COLUMN IF EXISTS "dispense_billing_id"`);
    await queryRunner.query(`ALTER TABLE "optical_prescriptions" DROP COLUMN IF EXISTS "lens_price"`);
    await queryRunner.query(`ALTER TABLE "optical_prescriptions" DROP COLUMN IF EXISTS "frame_price"`);
  }
}
