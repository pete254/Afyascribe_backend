import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The dose form and route in words. HPT gives them as codes (DF…, RT…) whose
 * names live in separate concepts, so an item showed "DF10449" where it should
 * read "Spray". Idempotent.
 */
export class AddDoseFormAndRoute1760200000000 implements MigrationInterface {
  name = 'AddDoseFormAndRoute1760200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "dose_form" character varying(80)`);
    await queryRunner.query(`ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "route" character varying(80)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "route"`);
    await queryRunner.query(`ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "dose_form"`);
  }
}
