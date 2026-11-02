import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Surveillance that does not wait to be looked at (Disease Reporting
 * Specification D-3, D-8; IDSR Reporting Specification I-3, I-6, I-7):
 *
 * - retry bookkeeping on case notifications and weekly returns;
 * - a record of the reminders sent, so none is sent twice;
 * - the facility's surveillance contact email;
 * - which MOH 505 laboratory line a lab test counts towards.
 *
 * Idempotent.
 */
const COLUMNS: [string, string][] = [
  ['disease_notifications', '"alert_attempts" integer NOT NULL DEFAULT 0'],
  ['disease_notifications', '"next_alert_at" TIMESTAMP WITH TIME ZONE'],
  ['disease_notifications', '"alert_error" text'],
  ['disease_notifications', '"alert_escalated_at" TIMESTAMP WITH TIME ZONE'],
  ['disease_notifications', '"overdue_reminded_at" TIMESTAMP WITH TIME ZONE'],
  ['idsr_weekly_returns', '"submission_attempts" integer NOT NULL DEFAULT 0'],
  ['idsr_weekly_returns', '"next_submission_at" TIMESTAMP WITH TIME ZONE'],
  ['idsr_weekly_returns', '"submission_error" text'],
  ['idsr_weekly_returns', '"submission_escalated_at" TIMESTAMP WITH TIME ZONE'],
  ['facilities', '"surveillance_email" character varying(254)'],
  ['facilities', '"idsr_reminded_week" character varying(10)'],
  ['lab_tests', '"moh505_lab" character varying(40)'],
];

export class SurveillanceAutomation1762500000000 implements MigrationInterface {
  name = 'SurveillanceAutomation1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, col] of COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS ${col}`,
      );
    }
    // The retry job looks for these and nothing else.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_disease_notifications_next_alert" ON "disease_notifications" ("next_alert_at") WHERE "next_alert_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_idsr_weekly_returns_next_submission" ON "idsr_weekly_returns" ("next_submission_at") WHERE "next_submission_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_idsr_weekly_returns_next_submission"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_disease_notifications_next_alert"`,
    );
    for (const [table, col] of [...COLUMNS].reverse()) {
      const name = col.split('"')[1];
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${name}"`,
      );
    }
  }
}
