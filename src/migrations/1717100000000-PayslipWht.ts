import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Withholding tax on payslips — the 5% WHT deducted from contracted staff in
 * lieu of PAYE/statutory, credited to WHT Payable (21011) and remitted to KRA.
 */
export class PayslipWht1717100000000 implements MigrationInterface {
  name = 'PayslipWht1717100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "wht" numeric(14,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payslips" DROP COLUMN IF EXISTS "wht"`);
  }
}
