import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Link imaging studies to the exam catalogue: the exam ordered plus a snapshot
 * of its name and LOINC code, so each study is coded for DHA/SHA exchange
 * without a join. Idempotent.
 */
export class LinkRadiologyStudiesToExams1758950000000 implements MigrationInterface {
  name = 'LinkRadiologyStudiesToExams1758950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "radiology" ADD COLUMN IF NOT EXISTS "exam_id" uuid`);
    await queryRunner.query(`ALTER TABLE "radiology" ADD COLUMN IF NOT EXISTS "exam_name" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "radiology" ADD COLUMN IF NOT EXISTS "loinc_code" character varying(32)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "radiology" DROP COLUMN IF EXISTS "loinc_code"`);
    await queryRunner.query(`ALTER TABLE "radiology" DROP COLUMN IF EXISTS "exam_name"`);
    await queryRunner.query(`ALTER TABLE "radiology" DROP COLUMN IF EXISTS "exam_id"`);
  }
}
