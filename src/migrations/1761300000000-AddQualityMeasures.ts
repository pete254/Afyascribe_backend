import { MigrationInterface, QueryRunner } from 'typeorm';

/** Clinical quality measures: imported definitions, and the values reported. Idempotent. */
export class AddQualityMeasures1761300000000 implements MigrationInterface {
  name = 'AddQualityMeasures1761300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "quality_measures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "measure_id" character varying(120) NOT NULL,
        "title" character varying(300) NOT NULL,
        "description" text,
        "numerator" text NOT NULL,
        "denominator" text NOT NULL,
        "scoring" character varying(20) NOT NULL DEFAULT 'proportion',
        "improvement" character varying(20) NOT NULL DEFAULT 'increase',
        "category" character varying(120),
        "provenance" character varying(20) NOT NULL DEFAULT 'imported',
        "national_indicator" character varying(200),
        "source_document" jsonb,
        "imported_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quality_measures" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_quality_measures_id" ON "quality_measures" ("facility_id", "measure_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "measure_values" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "measure_id" character varying(120) NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "numerator" integer NOT NULL,
        "denominator" integer,
        "rate" numeric(5,1),
        "calculated" boolean NOT NULL DEFAULT true,
        "note" text,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "submitted_to" character varying(300),
        "submission_status" character varying(40),
        "recorded_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_measure_values" PRIMARY KEY ("id")
      )
    `);
    // One figure per measure per period; recalculating replaces it.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_measure_values_period" ON "measure_values" ("facility_id", "measure_id", "period_start")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "measure_values"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quality_measures"`);
  }
}
