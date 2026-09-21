import { MigrationInterface, QueryRunner } from 'typeorm';

/** Remember the last ad-hoc amount charged for unpriced imaging exams and drugs. */
export class AddSuggestedPrices1759300000000 implements MigrationInterface {
  name = 'AddSuggestedPrices1759300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "radiology_exams" ADD COLUMN IF NOT EXISTS "suggested_price" numeric(14,2)`);
    await queryRunner.query(`ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "suggested_price" numeric(14,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "suggested_price"`);
    await queryRunner.query(`ALTER TABLE "radiology_exams" DROP COLUMN IF EXISTS "suggested_price"`);
  }
}
