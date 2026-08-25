import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Petty cash / imprest book. Each voucher is a single movement in the tin
 * (topup in / expense out) and links to the balanced GL journal it posted.
 */
export class PettyCash1716700000000 implements MigrationInterface {
  name = 'PettyCash1716700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "petty_cash_vouchers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "voucher_no" character varying(30) NOT NULL,
        "type" character varying(10) NOT NULL,
        "date" date NOT NULL,
        "description" text NOT NULL,
        "payee" character varying(200),
        "expense_account_code" character varying(20),
        "source_account_code" character varying(20),
        "amount" numeric(14,2) NOT NULL,
        "journal_id" uuid,
        "recorded_by_id" uuid,
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_petty_cash_vouchers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_petty_cash_facility_date" ON "petty_cash_vouchers" ("facility_id", "date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_petty_cash_facility_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "petty_cash_vouchers"`);
  }
}
