import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Practitioner regulatory identity for DHA/SHA interoperability: the licensing
 * body (KMPDC, NCK, COC, PPB, KMLTTB, …) and the official registration number.
 * This is distinct from the internal practitioner_no printed on prescriptions.
 * Idempotent.
 */
export class AddPractitionerRegulatoryIdentity1758700000000 implements MigrationInterface {
  name = 'AddPractitionerRegulatoryIdentity1758700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "regulatory_body" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "regulatory_number" character varying(60)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "regulatory_body"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "regulatory_number"`);
  }
}
