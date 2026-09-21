import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Code each lab analyte with its own LOINC (panel member) and scale, so result
 * Observations are LOINC-coded per the Kenya Core IG. Idempotent.
 */
export class AddLoincToLabAnalytes1759000000000 implements MigrationInterface {
  name = 'AddLoincToLabAnalytes1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lab_analytes" ADD COLUMN IF NOT EXISTS "loinc_code" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "lab_analytes" ADD COLUMN IF NOT EXISTS "scale" character varying(10)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lab_analytes" DROP COLUMN IF EXISTS "scale"`);
    await queryRunner.query(`ALTER TABLE "lab_analytes" DROP COLUMN IF EXISTS "loinc_code"`);
  }
}
