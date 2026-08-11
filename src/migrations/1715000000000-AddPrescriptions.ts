import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prescriptions & pharmacy dispensing. A doctor writes a prescription (one row
 * per medication); it waits in the pharmacy queue where the pharmacist links
 * each line to a stock item, prices it, bills it, and dispenses it. Also
 * registers the `pharmacist` role. Idempotent.
 */
export class AddPrescriptions1715000000000 implements MigrationInterface {
  name = 'AddPrescriptions1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New role value on the existing users_role_enum (PG 12+ allows this).
    await queryRunner.query(
      `ALTER TYPE users_role_enum ADD VALUE IF NOT EXISTS 'pharmacist'`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        rx_no varchar(30) NOT NULL,
        patient_id uuid NOT NULL,
        patient_name varchar,
        patient_no varchar,
        visit_id uuid,
        doctor_id uuid,
        doctor_name varchar,
        diagnosis text,
        notes text,
        status varchar(20) NOT NULL DEFAULT 'pending',
        dispensed_by_id uuid,
        dispensed_by_name varchar,
        dispensed_at timestamptz,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_prescriptions_facility_status ON prescriptions (facility_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_prescriptions_facility_patient ON prescriptions (facility_id, patient_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS prescription_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
        medication varchar NOT NULL,
        dosage varchar,
        frequency varchar,
        duration varchar,
        quantity_text varchar,
        instructions text,
        item_id uuid,
        dispense_qty numeric(14,3),
        unit_price numeric(14,2),
        billing_id uuid,
        dispensed boolean NOT NULL DEFAULT false,
        sort_order int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_prescription_items_rx ON prescription_items (prescription_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS prescription_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS prescriptions`);
    // Enum values cannot be dropped in Postgres; leaving 'pharmacist' in place.
  }
}
