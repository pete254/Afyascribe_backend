import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The employer's KRA PIN on payroll settings — printed on the P9A tax
 * deduction cards issued to employees.
 */
export class EmployerPin1717000000000 implements MigrationInterface {
  name = 'EmployerPin1717000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "employer_pin" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payroll_settings" DROP COLUMN IF EXISTS "employer_pin"`);
  }
}
