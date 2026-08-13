import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bank reconciliation: editable categorisation rules table, and an adjustments
 * snapshot column on reconciliations so historical reports keep their full
 * deposits-in-transit / outstanding-payment detail. Idempotent.
 */
export class AddBankReconRulesAndAdjustments1715600000000 implements MigrationInterface {
  name = 'AddBankReconRulesAndAdjustments1715600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_reconciliations ADD COLUMN IF NOT EXISTS adjustments jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bank_recon_rules (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        pattern varchar(200) NOT NULL,
        is_regex boolean NOT NULL DEFAULT false,
        account_code varchar(20) NOT NULL,
        account_name varchar(120),
        priority int NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_bank_recon_rules PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_bank_recon_rules_facility ON bank_recon_rules (facility_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bank_recon_rules_facility`);
    await queryRunner.query(`DROP TABLE IF EXISTS bank_recon_rules`);
    await queryRunner.query(`ALTER TABLE bank_reconciliations DROP COLUMN IF EXISTS adjustments`);
  }
}
