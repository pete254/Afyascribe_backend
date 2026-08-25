import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A payer (insurance_schemes row) is either an insurer or a corporate/employer
 * client billed on account. Existing rows are all insurers; corporates are
 * flagged so they get their own AR ledger and GL control accounts.
 */
export class SchemePayerType1716600000000 implements MigrationInterface {
  name = 'SchemePayerType1716600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "insurance_schemes" ADD COLUMN IF NOT EXISTS "payer_type" character varying(20) NOT NULL DEFAULT 'insurer'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "insurance_schemes" DROP COLUMN IF EXISTS "payer_type"`);
  }
}
