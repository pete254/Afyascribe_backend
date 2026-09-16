import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Map service-catalogue items (procedures / interventions) to the KNHTS
 * WHO/ICHI code system for DHA interoperability. Idempotent.
 */
export class AddIchiToServiceCatalog1758300000000 implements MigrationInterface {
  name = 'AddIchiToServiceCatalog1758300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "service_catalog" ADD COLUMN IF NOT EXISTS "knhts_code" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_catalog" ADD COLUMN IF NOT EXISTS "knhts_name" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "service_catalog" DROP COLUMN IF EXISTS "knhts_code"`);
    await queryRunner.query(`ALTER TABLE "service_catalog" DROP COLUMN IF EXISTS "knhts_name"`);
  }
}
