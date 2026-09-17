import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Map service-catalogue items to the SHA benefit package
 * (MOH-KENYA/BenefitsAndInterventions) so charges can be claimed. Idempotent.
 */
export class AddShaBenefitToServiceCatalog1758800000000 implements MigrationInterface {
  name = 'AddShaBenefitToServiceCatalog1758800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "service_catalog" ADD COLUMN IF NOT EXISTS "sha_benefit_code" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_catalog" ADD COLUMN IF NOT EXISTS "sha_benefit_name" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "service_catalog" DROP COLUMN IF EXISTS "sha_benefit_code"`);
    await queryRunner.query(`ALTER TABLE "service_catalog" DROP COLUMN IF EXISTS "sha_benefit_name"`);
  }
}
