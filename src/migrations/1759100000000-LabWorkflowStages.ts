import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lab workflow in lab vocabulary: ordered→requested, collected+in_progress→in_lab,
 * resulted→awaiting_review, verified→released. Adds sample-rejection and
 * post-release amendment history on each test item. Idempotent.
 */
export class LabWorkflowStages1759100000000 implements MigrationInterface {
  name = 'LabWorkflowStages1759100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['lab_orders', 'lab_order_items']) {
      await queryRunner.query(`UPDATE "${table}" SET status = 'requested' WHERE status = 'ordered'`);
      await queryRunner.query(`UPDATE "${table}" SET status = 'in_lab' WHERE status IN ('collected', 'in_progress')`);
      await queryRunner.query(`UPDATE "${table}" SET status = 'awaiting_review' WHERE status = 'resulted'`);
      await queryRunner.query(`UPDATE "${table}" SET status = 'released' WHERE status = 'verified'`);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN status SET DEFAULT 'requested'`);
    }
    await queryRunner.query(`ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "rejections" jsonb NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "amendments" jsonb NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "amended_by_id" uuid`);
    await queryRunner.query(`ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "amended_by_name" character varying`);
    await queryRunner.query(`ALTER TABLE "lab_order_items" ADD COLUMN IF NOT EXISTS "amended_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['amended_at', 'amended_by_name', 'amended_by_id', 'amendments', 'rejections']) {
      await queryRunner.query(`ALTER TABLE "lab_order_items" DROP COLUMN IF EXISTS "${col}"`);
    }
    for (const table of ['lab_orders', 'lab_order_items']) {
      await queryRunner.query(`UPDATE "${table}" SET status = 'ordered' WHERE status = 'requested'`);
      await queryRunner.query(`UPDATE "${table}" SET status = 'collected' WHERE status = 'in_lab'`);
      await queryRunner.query(`UPDATE "${table}" SET status = 'resulted' WHERE status = 'awaiting_review'`);
      await queryRunner.query(`UPDATE "${table}" SET status = 'verified' WHERE status = 'released'`);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN status SET DEFAULT 'ordered'`);
    }
  }
}
