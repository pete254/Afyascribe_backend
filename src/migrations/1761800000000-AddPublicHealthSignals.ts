import { MigrationInterface, QueryRunner } from 'typeorm';

/** Alert and action thresholds crossed, and what was done about them. Idempotent. */
export class AddPublicHealthSignals1761800000000 implements MigrationInterface {
  name = 'AddPublicHealthSignals1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public_health_signals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "year" integer NOT NULL,
        "week" integer NOT NULL,
        "condition_code" character varying(40) NOT NULL,
        "condition_name" character varying(200) NOT NULL,
        "level" character varying(20) NOT NULL,
        "rule" character varying(40) NOT NULL,
        "detail" text NOT NULL,
        "count" integer NOT NULL,
        "threshold" integer,
        "published" boolean NOT NULL DEFAULT true,
        "status" character varying(20) NOT NULL DEFAULT 'open',
        "acknowledged_at" TIMESTAMP WITH TIME ZONE,
        "acknowledged_by_name" character varying(200),
        "response" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_public_health_signals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_public_health_signals_status" ON "public_health_signals" ("facility_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_public_health_signals_week" ON "public_health_signals" ("facility_id", "year", "week")`,
    );
    // The same rule firing for the same condition in the same week is one signal.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_public_health_signals" ON "public_health_signals" ("facility_id", "year", "week", "condition_code", "rule")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "public_health_signals"`);
  }
}
