import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-facility policy: may a patient who still has an unpaid bill be seen by the
 * doctor? Defaults to false (blocked) — the long-standing behaviour — so a
 * facility must opt in to allow consultations on credit. Idempotent.
 */
export class AddPendingBillPolicy1714500000000 implements MigrationInterface {
  name = 'AddPendingBillPolicy1714500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS allow_doctor_with_pending_bill boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE facilities DROP COLUMN IF EXISTS allow_doctor_with_pending_bill`,
    );
  }
}
