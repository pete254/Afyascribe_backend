import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Map pharmacy inventory items to the KNHTS Health Products & Technologies
 * (MOH-PPB/HPT) code system for DHA interoperability. Idempotent.
 */
export class AddKnhtsToInventoryItems1758200000000 implements MigrationInterface {
  name = 'AddKnhtsToInventoryItems1758200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "knhts_code" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "knhts_name" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "knhts_code"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "knhts_name"`);
  }
}
