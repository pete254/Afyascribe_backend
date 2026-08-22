import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deposits become a billing-queue line collected by the cashier (rather than
 * money taken at the ward). Flag the line so the running bill excludes it from
 * charges and the GL books it as a patient-deposit liability, not revenue.
 */
export class BillingDepositFlag1716300000000 implements MigrationInterface {
  name = 'BillingDepositFlag1716300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing" ADD COLUMN IF NOT EXISTS "is_deposit" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing" DROP COLUMN IF EXISTS "is_deposit"`);
  }
}
