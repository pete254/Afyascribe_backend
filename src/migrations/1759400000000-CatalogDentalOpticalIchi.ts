import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Service catalogue: dental + optical categories (for ICHI-imported national
 * procedure lists), a remembered ad-hoc price, and the dental/optical records
 * linked to the catalogue item they were charged as. Idempotent.
 */
export class CatalogDentalOpticalIchi1759400000000 implements MigrationInterface {
  name = 'CatalogDentalOpticalIchi1759400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_catalog_category_enum') THEN
          ALTER TYPE "service_catalog_category_enum" ADD VALUE IF NOT EXISTS 'dental';
          ALTER TYPE "service_catalog_category_enum" ADD VALUE IF NOT EXISTS 'optical';
        END IF;
      END $$;
    `);
    await queryRunner.query(`ALTER TABLE "service_catalog" ADD COLUMN IF NOT EXISTS "suggested_price" numeric(14,2)`);
    for (const table of ['dental_treatments', 'optical_prescriptions']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "service_id" uuid`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "service_name" character varying(200)`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "knhts_code" character varying(64)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['dental_treatments', 'optical_prescriptions']) {
      for (const col of ['knhts_code', 'service_name', 'service_id']) {
        await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${col}"`);
      }
    }
    await queryRunner.query(`ALTER TABLE "service_catalog" DROP COLUMN IF EXISTS "suggested_price"`);
    // Enum values are left in place (Postgres cannot drop them safely).
  }
}
