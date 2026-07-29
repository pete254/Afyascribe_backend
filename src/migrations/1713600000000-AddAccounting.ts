import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The accounting core: chart of accounts (ledger_accounts) and the double-entry
 * general ledger (journal_entries + journal_lines). Money is numeric(14,2).
 *
 * Every statement is idempotent (IF NOT EXISTS), so it is safe to run more than
 * once — migrationsRun applies it on boot.
 */
export class AddAccounting1713600000000 implements MigrationInterface {
  name = 'AddAccounting1713600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        code varchar(20) NOT NULL,
        name varchar NOT NULL,
        type varchar(30) NOT NULL,
        normal_balance varchar(6) NOT NULL,
        parent_code varchar(20),
        is_postable boolean NOT NULL DEFAULT true,
        is_active boolean NOT NULL DEFAULT true,
        is_system boolean NOT NULL DEFAULT false,
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_accounts_facility_code ON ledger_accounts (facility_id, code);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_id uuid NOT NULL,
        entry_no varchar(30) NOT NULL,
        date date NOT NULL,
        memo text,
        source varchar(40) NOT NULL DEFAULT 'manual',
        source_type varchar(60),
        source_id uuid,
        status varchar(10) NOT NULL DEFAULT 'posted',
        posted_by_id uuid,
        reversal_of_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_journal_entries_facility_date ON journal_entries (facility_id, date);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries (facility_id, source, source_id);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS journal_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        facility_id uuid NOT NULL,
        account_code varchar(20) NOT NULL,
        debit numeric(14,2) NOT NULL DEFAULT 0,
        credit numeric(14,2) NOT NULL DEFAULT 0,
        description text,
        cost_center varchar(60),
        line_no int NOT NULL DEFAULT 0
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_journal_lines_facility_account ON journal_lines (facility_id, account_code);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines (journal_entry_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS journal_lines;`);
    await queryRunner.query(`DROP TABLE IF EXISTS journal_entries;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_accounts;`);
  }
}
