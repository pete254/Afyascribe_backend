import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPatientColumns1698200000000 implements MigrationInterface {
  name = 'AddPatientColumns1698200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "middleName" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "title" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "maritalStatus" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "occupation" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "idType" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "idNumber" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "nationality" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "county" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "subCounty" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "postalCode" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "howKnown" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "patientType" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "medicalPlan" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "membershipNo" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "membershipNo"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "medicalPlan"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "patientType"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "howKnown"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "postalCode"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "subCounty"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "county"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "nationality"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "idNumber"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "idType"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "occupation"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "maritalStatus"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "title"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "middleName"`);
  }
}
