import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customisable payroll: a per-facility settings table (which statutory items
 * apply + their rates) and per-employee statutory switches plus recurring
 * allowances/deductions. Idempotent.
 */
export class AddPayrollCustomization1715700000000 implements MigrationInterface {
  name = 'AddPayrollCustomization1715700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payroll_settings (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        paye_enabled boolean NOT NULL DEFAULT true,
        nssf_enabled boolean NOT NULL DEFAULT true,
        shif_enabled boolean NOT NULL DEFAULT true,
        housing_enabled boolean NOT NULL DEFAULT true,
        nssf_rate numeric(8,5) NOT NULL DEFAULT 0.06,
        nssf_upper_limit numeric(14,2) NOT NULL DEFAULT 72000,
        shif_rate numeric(8,5) NOT NULL DEFAULT 0.0275,
        shif_min numeric(14,2) NOT NULL DEFAULT 300,
        housing_rate numeric(8,5) NOT NULL DEFAULT 0.015,
        personal_relief numeric(14,2) NOT NULL DEFAULT 2400,
        paye_bands jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_payroll_settings PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_settings_facility ON payroll_settings (facility_id)`,
    );

    await queryRunner.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS apply_paye boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS apply_nssf boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS apply_shif boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS apply_housing boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS allowances jsonb`);
    await queryRunner.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS deductions jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE employees DROP COLUMN IF EXISTS deductions`);
    await queryRunner.query(`ALTER TABLE employees DROP COLUMN IF EXISTS allowances`);
    await queryRunner.query(`ALTER TABLE employees DROP COLUMN IF EXISTS apply_housing`);
    await queryRunner.query(`ALTER TABLE employees DROP COLUMN IF EXISTS apply_shif`);
    await queryRunner.query(`ALTER TABLE employees DROP COLUMN IF EXISTS apply_nssf`);
    await queryRunner.query(`ALTER TABLE employees DROP COLUMN IF EXISTS apply_paye`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_payroll_settings_facility`);
    await queryRunner.query(`DROP TABLE IF EXISTS payroll_settings`);
  }
}
