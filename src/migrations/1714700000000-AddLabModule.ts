import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Laboratory module: a test catalog with reference-range analytes, and orders
 * whose test items move ordered → collected → in_progress → resulted → verified,
 * each carrying per-analyte result values. Also registers the lab_technician
 * role. Idempotent.
 */
export class AddLabModule1714700000000 implements MigrationInterface {
  name = 'AddLabModule1714700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New role value on the existing users_role_enum (PG 12+ allows this).
    await queryRunner.query(
      `ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'lab_technician'`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lab_tests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        code varchar(30),
        name varchar NOT NULL,
        specimen varchar(40) NOT NULL DEFAULT 'blood',
        department varchar(40),
        price numeric(14,2) NOT NULL DEFAULT 0,
        turnaround_hours int,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_lab_tests_facility ON lab_tests (facility_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lab_analytes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lab_test_id uuid NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
        name varchar NOT NULL,
        unit varchar(30),
        ref_low numeric(14,4),
        ref_high numeric(14,4),
        ref_text varchar,
        sort_order int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_lab_analytes_test ON lab_analytes (lab_test_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lab_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        order_no varchar(30) NOT NULL,
        patient_id uuid NOT NULL,
        patient_name varchar,
        patient_no varchar,
        visit_id uuid,
        ordered_by_id uuid,
        ordered_by_name varchar,
        priority varchar(20) NOT NULL DEFAULT 'routine',
        clinical_notes text,
        status varchar(20) NOT NULL DEFAULT 'ordered',
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_lab_orders_facility_status ON lab_orders (facility_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_lab_orders_facility_patient ON lab_orders (facility_id, patient_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lab_order_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
        lab_test_id uuid NOT NULL,
        test_name varchar NOT NULL,
        specimen varchar(40),
        department varchar(40),
        price numeric(14,2) NOT NULL DEFAULT 0,
        status varchar(20) NOT NULL DEFAULT 'ordered',
        collected_by_id uuid,
        collected_by_name varchar,
        collected_at timestamptz,
        specimen_note text,
        started_at timestamptz,
        result_note text,
        resulted_by_id uuid,
        resulted_by_name varchar,
        resulted_at timestamptz,
        verified_by_id uuid,
        verified_by_name varchar,
        verified_at timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_lab_order_items_order ON lab_order_items (order_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lab_result_values (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_item_id uuid NOT NULL REFERENCES lab_order_items(id) ON DELETE CASCADE,
        analyte_id uuid,
        analyte_name varchar NOT NULL,
        unit varchar(30),
        ref_low numeric(14,4),
        ref_high numeric(14,4),
        ref_text varchar,
        value varchar,
        flag varchar(12),
        sort_order int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_lab_result_values_item ON lab_result_values (order_item_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS lab_result_values`);
    await queryRunner.query(`DROP TABLE IF EXISTS lab_order_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS lab_orders`);
    await queryRunner.query(`DROP TABLE IF EXISTS lab_analytes`);
    await queryRunner.query(`DROP TABLE IF EXISTS lab_tests`);
    // Enum values cannot be dropped in Postgres; leaving 'lab_technician' in place.
  }
}
