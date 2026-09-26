import { MigrationInterface, QueryRunner } from 'typeorm';

/** MOH 505, the IDSR weekly epidemic monitoring return. Idempotent. */
export class AddIdsrWeeklyReturns1761700000000 implements MigrationInterface {
  name = 'AddIdsrWeeklyReturns1761700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "idsr_weekly_returns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "year" integer NOT NULL,
        "week" integer NOT NULL,
        "week_start" date NOT NULL,
        "week_end" date NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "rows" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "lab_surveillance" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "others" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "sites_reported" integer,
        "sites_expected" integer,
        "reported_by_name" character varying(200),
        "reported_by_designation" character varying(120),
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "submitted_to" character varying(300),
        "submission_status" character varying(40),
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_idsr_weekly_returns" PRIMARY KEY ("id")
      )
    `);
    // One return per facility per epidemiological week.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_idsr_weekly_returns_week" ON "idsr_weekly_returns" ("facility_id", "year", "week")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "idsr_weekly_returns"`);
  }
}
