import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Structured attendance type on a visit — powers New/Revisit classification on
 * the MOH outpatient registers (204A/204B) — plus a link back to the
 * appointment a visit fulfils. Both nullable for existing rows.
 */
export class AddVisitType1715800000000 implements MigrationInterface {
  name = 'AddVisitType1715800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "patient_visits" ADD COLUMN IF NOT EXISTS "visit_type" varchar(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "patient_visits" ADD COLUMN IF NOT EXISTS "appointment_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patient_visits" DROP COLUMN IF EXISTS "appointment_id"`);
    await queryRunner.query(`ALTER TABLE "patient_visits" DROP COLUMN IF EXISTS "visit_type"`);
  }
}
