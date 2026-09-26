import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MOH 502 — the integrated case-based surveillance form — on the notification,
 * and a record of the alert that was sent. Idempotent.
 */
export class AddMoh502Fields1761600000000 implements MigrationInterface {
  name = 'AddMoh502Fields1761600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const add = async (col: string, type: string, extra = '') =>
      queryRunner.query(
        `ALTER TABLE "disease_notifications" ADD COLUMN IF NOT EXISTS "${col}" ${type} ${extra}`.trim(),
      );

    await add('epid_no', 'character varying(60)');
    await add('first_seen_date', 'date');
    await add('notified_sub_county_at', 'TIMESTAMP WITH TIME ZONE');
    await add('means_of_diagnosis', 'character varying(20)');
    await add('patient_status', 'character varying(20)');
    await add('specimen_collected', 'boolean');
    await add('specimen_type', 'character varying(60)');
    await add('specimen_sent_date', 'date');
    await add('lab_name', 'character varying(200)');
    await add('lab_result_received', 'boolean');
    await add('reported_by_name', 'character varying(200)');
    await add('reported_by_designation', 'character varying(120)');
    await add('form', 'jsonb', "NOT NULL DEFAULT '{}'::jsonb");
    await add('alerted_at', 'TIMESTAMP WITH TIME ZONE');
    await add('alert_channel', 'character varying(60)');
    await add('alert_status', 'character varying(40)');
  }

  public async down(): Promise<void> {
    // Columns are left in place: dropping them would destroy notified cases.
  }
}
