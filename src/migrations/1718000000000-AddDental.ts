import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dental module: per-patient tooth treatments (exam, scaling, filling,
 * extraction, root canal…) with a workflow and billing, plus the 'dentist'
 * role. Idempotent.
 */
export class AddDental1718000000000 implements MigrationInterface {
  name = 'AddDental1718000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dental_treatments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        visit_id uuid,
        tooth varchar(10),
        surfaces varchar(20),
        procedure varchar(30) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'PLANNED',
        findings text,
        notes text,
        price numeric(12,2),
        billing_id uuid,
        requested_by_id uuid,
        performed_by_id uuid,
        performed_at timestamptz,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dental_facility ON dental_treatments (facility_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dental_patient ON dental_treatments (patient_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_dental_status ON dental_treatments (status)`);

    // Register the 'dentist' role on the users role enum (resolve its name
    // dynamically; only touch a genuine enum type).
    await queryRunner.query(`
      DO $$
      DECLARE enum_type text;
      BEGIN
        SELECT t.typname INTO enum_type
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE a.attrelid = 'users'::regclass AND a.attname = 'role' AND t.typtype = 'e';
        IF enum_type IS NULL THEN RETURN; END IF;
        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, 'dentist');
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dental_treatments`);
    // Enum values cannot be dropped safely; 'dentist' is left in place.
  }
}
