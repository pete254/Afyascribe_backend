import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optical / optometry module: eye exams, spectacle prescriptions (refraction per
 * eye) and dispensing, plus the 'optometrist' role. Idempotent.
 */
export class AddOptical1718100000000 implements MigrationInterface {
  name = 'AddOptical1718100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS optical_prescriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        visit_id uuid,
        rx_type varchar(20) NOT NULL DEFAULT 'DISTANCE',
        sphere_r varchar(12), cylinder_r varchar(12), axis_r varchar(8), add_r varchar(8), va_r varchar(12),
        sphere_l varchar(12), cylinder_l varchar(12), axis_l varchar(8), add_l varchar(8), va_l varchar(12),
        pd varchar(12), iop varchar(20),
        complaint text, findings text, advice text,
        frame varchar(160), lens_type varchar(160),
        price numeric(12,2), billing_id uuid,
        status varchar(20) NOT NULL DEFAULT 'EXAM',
        optometrist_id uuid,
        dispensed_at timestamptz,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_optical_facility ON optical_prescriptions (facility_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_optical_patient ON optical_prescriptions (patient_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_optical_status ON optical_prescriptions (status)`);

    await queryRunner.query(`
      DO $$
      DECLARE enum_type text;
      BEGIN
        SELECT t.typname INTO enum_type
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE a.attrelid = 'users'::regclass AND a.attname = 'role' AND t.typtype = 'e';
        IF enum_type IS NULL THEN RETURN; END IF;
        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, 'optometrist');
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS optical_prescriptions`);
  }
}
