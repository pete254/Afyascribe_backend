import { MigrationInterface, QueryRunner } from 'typeorm';

/** Remember the last ad-hoc amount charged for a lab test with no catalogue price. */
export class AddLabTestSuggestedPrice1759200000000 implements MigrationInterface {
  name = 'AddLabTestSuggestedPrice1759200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "suggested_price" numeric(14,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lab_tests" DROP COLUMN IF EXISTS "suggested_price"`);
  }
}
