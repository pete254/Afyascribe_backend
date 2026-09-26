import { MigrationInterface, QueryRunner } from 'typeorm';

/** Notifiable conditions seen in a patient, from suggestion to notification. Idempotent. */
export class AddDiseaseNotifications1761500000000 implements MigrationInterface {
  name = 'AddDiseaseNotifications1761500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disease_notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "visit_id" uuid,
        "condition_code" character varying(40) NOT NULL,
        "condition_name" character varying(200) NOT NULL,
        "immediate" boolean NOT NULL DEFAULT false,
        "detected_from" character varying(20) NOT NULL DEFAULT 'diagnosis',
        "source_text" text,
        "status" character varying(20) NOT NULL DEFAULT 'suggested',
        "case_classification" character varying(20) NOT NULL DEFAULT 'suspected',
        "onset_date" date,
        "detected_at" TIMESTAMP WITH TIME ZONE,
        "notified_at" TIMESTAMP WITH TIME ZONE,
        "notified_by_name" character varying(200),
        "dismissed_reason" text,
        "dismissed_by_name" character varying(200),
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_disease_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_disease_notifications_status" ON "disease_notifications" ("facility_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_disease_notifications_condition" ON "disease_notifications" ("facility_id", "condition_code", "onset_date")`,
    );
    // The same condition suggested twice for one visit is one suggestion.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_disease_notifications_visit" ON "disease_notifications" ("patient_id", "visit_id", "condition_code") WHERE "visit_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "disease_notifications"`);
  }
}
