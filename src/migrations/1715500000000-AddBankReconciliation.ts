import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bank reconciliation. Adds the reconciliation session table and two columns on
 * journal_lines that stamp a cash/bank line as cleared under a reconciliation.
 * Idempotent.
 */
export class AddBankReconciliation1715500000000 implements MigrationInterface {
  name = 'AddBankReconciliation1715500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bank_reconciliations (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        account_code varchar(20) NOT NULL,
        account_name varchar(120),
        statement_date date NOT NULL,
        statement_balance numeric(16,2) NOT NULL DEFAULT 0,
        opening_balance numeric(16,2) NOT NULL DEFAULT 0,
        reconciled_balance numeric(16,2) NOT NULL DEFAULT 0,
        difference numeric(16,2) NOT NULL DEFAULT 0,
        gl_balance numeric(16,2) NOT NULL DEFAULT 0,
        cleared_count int NOT NULL DEFAULT 0,
        status varchar(12) NOT NULL DEFAULT 'review',
        note text,
        created_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_bank_reconciliations PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_bank_recon_facility_account ON bank_reconciliations (facility_id, account_code)`,
    );

    await queryRunner.query(
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS reconciliation_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS cleared_at timestamptz`,
    );
    // Fast lookup of a bank account's still-uncleared lines.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_journal_lines_recon ON journal_lines (facility_id, account_code, reconciliation_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_journal_lines_recon`);
    await queryRunner.query(`ALTER TABLE journal_lines DROP COLUMN IF EXISTS cleared_at`);
    await queryRunner.query(`ALTER TABLE journal_lines DROP COLUMN IF EXISTS reconciliation_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_bank_recon_facility_account`);
    await queryRunner.query(`DROP TABLE IF EXISTS bank_reconciliations`);
  }
}
