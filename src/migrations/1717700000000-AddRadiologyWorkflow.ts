import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fuller radiology workflow: body part, priority, when it was performed, the
 * structured report (findings + impression) and who reported it / when.
 * Idempotent.
 */
export class AddRadiologyWorkflow1717700000000 implements MigrationInterface {
  name = 'AddRadiologyWorkflow1717700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS body_part varchar(120)`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'ROUTINE'`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS performed_at timestamptz`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS findings text`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS impression text`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS reported_by_id uuid`);
    await queryRunner.query(`ALTER TABLE radiology ADD COLUMN IF NOT EXISTS reported_at timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['reported_at', 'reported_by_id', 'impression', 'findings', 'performed_at', 'priority', 'body_part']) {
      await queryRunner.query(`ALTER TABLE radiology DROP COLUMN IF EXISTS ${col}`);
    }
  }
}
