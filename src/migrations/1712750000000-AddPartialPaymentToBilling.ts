import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartialPaymentToBilling1712750000000 implements MigrationInterface {
  name = 'AddPartialPaymentToBilling1712750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add amount_paid column (tracks how much has been collected so far)
    await queryRunner.query(`
      ALTER TABLE "billing"
      ADD COLUMN IF NOT EXISTS "amount_paid" NUMERIC(10,2) DEFAULT 0 NOT NULL
    `);

    // Add payment_history column (JSONB array of individual payment transactions)
    await queryRunner.query(`
      ALTER TABLE "billing"
      ADD COLUMN IF NOT EXISTS "payment_history" JSONB DEFAULT '[]' NOT NULL
    `);

    // Back-fill existing paid bills: set amount_paid = amount for already paid records
    await queryRunner.query(`
      UPDATE "billing"
      SET "amount_paid" = "amount"
      WHERE "status" IN ('paid', 'waived') AND "amount_paid" = 0
    `);

    console.log('✅ Migration complete: amount_paid and payment_history added to billing table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing" DROP COLUMN IF EXISTS "payment_history"`);
    await queryRunner.query(`ALTER TABLE "billing" DROP COLUMN IF EXISTS "amount_paid"`);
  }
}
