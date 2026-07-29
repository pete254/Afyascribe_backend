import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payroll: employees, payroll runs and payslips. Statutory figures are frozen
 * onto each payslip at build time. Idempotent (IF NOT EXISTS).
 */
export class AddPayroll1713800000000 implements MigrationInterface {
  name = 'AddPayroll1713800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        employee_no varchar(30) NOT NULL,
        first_name varchar NOT NULL,
        last_name varchar NOT NULL,
        national_id varchar(40),
        kra_pin varchar(40),
        nssf_no varchar(40),
        shif_no varchar(40),
        job_title varchar,
        department varchar,
        basic_salary numeric(14,2) NOT NULL DEFAULT 0,
        bank_name varchar,
        bank_account varchar,
        phone varchar,
        email varchar,
        employment_type varchar(30) NOT NULL DEFAULT 'permanent',
        hire_date date,
        user_id uuid,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_employees_facility_no ON employees (facility_id, employee_no);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        run_no varchar(30) NOT NULL,
        period_month varchar(7) NOT NULL,
        pay_date date,
        bank_account_code varchar(20) NOT NULL DEFAULT '11003',
        status varchar(10) NOT NULL DEFAULT 'draft',
        total_gross numeric(14,2) NOT NULL DEFAULT 0,
        total_paye numeric(14,2) NOT NULL DEFAULT 0,
        total_statutory numeric(14,2) NOT NULL DEFAULT 0,
        total_net numeric(14,2) NOT NULL DEFAULT 0,
        total_employer_cost numeric(14,2) NOT NULL DEFAULT 0,
        accrual_journal_id uuid,
        payment_journal_id uuid,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_payroll_runs_facility_period ON payroll_runs (facility_id, period_month);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payslips (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payroll_run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
        facility_id uuid NOT NULL,
        employee_id uuid NOT NULL,
        employee_name varchar NOT NULL,
        basic numeric(14,2) NOT NULL DEFAULT 0,
        allowances jsonb,
        gross_pay numeric(14,2) NOT NULL DEFAULT 0,
        paye numeric(14,2) NOT NULL DEFAULT 0,
        nssf_employee numeric(14,2) NOT NULL DEFAULT 0,
        nssf_employer numeric(14,2) NOT NULL DEFAULT 0,
        shif numeric(14,2) NOT NULL DEFAULT 0,
        housing_employee numeric(14,2) NOT NULL DEFAULT 0,
        housing_employer numeric(14,2) NOT NULL DEFAULT 0,
        other_deductions jsonb,
        total_deductions numeric(14,2) NOT NULL DEFAULT 0,
        net_pay numeric(14,2) NOT NULL DEFAULT 0
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_payslips_facility_employee ON payslips (facility_id, employee_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payslips;`);
    await queryRunner.query(`DROP TABLE IF EXISTS payroll_runs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS employees;`);
  }
}
