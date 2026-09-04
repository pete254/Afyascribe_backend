import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRadiology1717400000000 implements MigrationInterface {
  name = 'AddRadiology1717400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS radiology (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        type varchar(30) NOT NULL,
        requested_by_id uuid,
        performed_by_id uuid,
        scheduled_at timestamptz,
        status varchar(20) NOT NULL DEFAULT 'REQUESTED',
        notes text,
        report text,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_radiology_facility ON radiology (facility_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_radiology_patient ON radiology (patient_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_radiology_status ON radiology (status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS radiology`);
  }
}
