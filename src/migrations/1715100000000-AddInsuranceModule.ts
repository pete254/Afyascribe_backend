import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Insurance module: structured insurance capture on patients (payer type,
 * insurer, cover validity) and claim tracking on bills (insurer, member number,
 * claim status / reference / submission time). Insurers reuse the existing
 * insurance_schemes table. Idempotent.
 */
export class AddInsuranceModule1715100000000 implements MigrationInterface {
  name = 'AddInsuranceModule1715100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Patient insurance capture
    await queryRunner.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS payer_type varchar(20)`);
    await queryRunner.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurer_name varchar(200)`);
    await queryRunner.query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_valid_until date`);

    // Billing claim tracking
    await queryRunner.query(`ALTER TABLE billing ADD COLUMN IF NOT EXISTS insurer_name varchar(200)`);
    await queryRunner.query(`ALTER TABLE billing ADD COLUMN IF NOT EXISTS member_number varchar(100)`);
    await queryRunner.query(`ALTER TABLE billing ADD COLUMN IF NOT EXISTS claim_status varchar(20)`);
    await queryRunner.query(`ALTER TABLE billing ADD COLUMN IF NOT EXISTS claim_ref varchar(100)`);
    await queryRunner.query(`ALTER TABLE billing ADD COLUMN IF NOT EXISTS claim_submitted_at timestamptz`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_billing_facility_claim ON billing (facility_id, claim_status)`,
    );

    // Backfill: existing insurance/split bills that are still owing become
    // 'pending' claims so they show up in the new claims register.
    await queryRunner.query(`
      UPDATE billing
         SET claim_status = 'pending'
       WHERE claim_status IS NULL
         AND payment_mode IN ('insurance', 'split')
         AND status = 'insurance_pending'
    `);
    await queryRunner.query(`
      UPDATE billing
         SET claim_status = 'paid'
       WHERE claim_status IS NULL
         AND payment_mode IN ('insurance', 'split')
         AND status = 'paid'
    `);
    // Carry the scheme name into insurer_name where we only have the one field.
    await queryRunner.query(`
      UPDATE billing
         SET insurer_name = insurance_scheme_name
       WHERE insurer_name IS NULL
         AND insurance_scheme_name IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_billing_facility_claim`);
    await queryRunner.query(`ALTER TABLE billing DROP COLUMN IF EXISTS claim_submitted_at`);
    await queryRunner.query(`ALTER TABLE billing DROP COLUMN IF EXISTS claim_ref`);
    await queryRunner.query(`ALTER TABLE billing DROP COLUMN IF EXISTS claim_status`);
    await queryRunner.query(`ALTER TABLE billing DROP COLUMN IF EXISTS member_number`);
    await queryRunner.query(`ALTER TABLE billing DROP COLUMN IF EXISTS insurer_name`);
    await queryRunner.query(`ALTER TABLE patients DROP COLUMN IF EXISTS insurance_valid_until`);
    await queryRunner.query(`ALTER TABLE patients DROP COLUMN IF EXISTS insurer_name`);
    await queryRunner.query(`ALTER TABLE patients DROP COLUMN IF EXISTS payer_type`);
  }
}
