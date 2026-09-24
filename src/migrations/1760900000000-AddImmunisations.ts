import { MigrationInterface, QueryRunner } from 'typeorm';

/** Doses given, against Kenya's national immunisation schedule. Idempotent. */
export class AddImmunisations1760900000000 implements MigrationInterface {
  name = 'AddImmunisations1760900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "immunisations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "vaccine" character varying(40) NOT NULL,
        "dose" integer NOT NULL,
        "given_date" date NOT NULL,
        "given_here" boolean NOT NULL DEFAULT true,
        "batch_no" character varying(60),
        "expiry_date" date,
        "site" character varying(60),
        "note" text,
        "given_by_id" uuid,
        "given_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_immunisations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_immunisations_patient" ON "immunisations" ("facility_id", "patient_id")`,
    );
    // The same dose of the same vaccine should not be recorded twice.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_immunisations_dose" ON "immunisations" ("facility_id", "patient_id", "vaccine", "dose")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "immunisations"`);
  }
}
