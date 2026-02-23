import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPatientColumns1698200000000 implements MigrationInterface {
  name = 'AddPatientColumns1698200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "middleName" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "title" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "maritalStatus" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "occupation" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "idType" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "idNumber" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "nationality" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "county" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "subCounty" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "postalCode" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "howKnown" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "patientType" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "medicalPlan" character varying`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN "membershipNo" character varying`);
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
