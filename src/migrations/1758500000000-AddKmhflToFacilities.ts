import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * National facility identity for DHA/HIE interoperability: the KMHFL code,
 * KEPH level and ownership type. The KMHFL code becomes the facility's
 * identifier on every FHIR submission (Organization / Encounter.serviceProvider).
 * Idempotent.
 */
export class AddKmhflToFacilities1758500000000 implements MigrationInterface {
  name = 'AddKmhflToFacilities1758500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "kmhfl_code" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "keph_level" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "ownership_type" character varying(60)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "facilities" DROP COLUMN IF EXISTS "kmhfl_code"`);
    await queryRunner.query(`ALTER TABLE "facilities" DROP COLUMN IF EXISTS "keph_level"`);
    await queryRunner.query(`ALTER TABLE "facilities" DROP COLUMN IF EXISTS "ownership_type"`);
  }
}
