import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Attach standardized coding to lab tests for KNHTS/DHA interoperability:
 * the KNHTS Investigation concept code plus its LOINC code and long name.
 * Idempotent.
 */
export class AddLoincToLabTests1758100000000 implements MigrationInterface {
  name = 'AddLoincToLabTests1758100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "knhts_code" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "loinc_code" character varying(32)`,
    );
    await queryRunner.query(`ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "loinc_name" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lab_tests" DROP COLUMN IF EXISTS "knhts_code"`);
    await queryRunner.query(`ALTER TABLE "lab_tests" DROP COLUMN IF EXISTS "loinc_code"`);
    await queryRunner.query(`ALTER TABLE "lab_tests" DROP COLUMN IF EXISTS "loinc_name"`);
  }
}
