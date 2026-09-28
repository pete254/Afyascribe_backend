import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Record versions: what a change did, not only that it happened. Idempotent.
 *
 * Append-only for the same reason the audit ledger is — a history that can be
 * edited is not a history.
 */
export class AddRecordVersions1761900000000 implements MigrationInterface {
  name = 'AddRecordVersions1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "record_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid,
        "entity_name" character varying(80) NOT NULL,
        "entity_id" character varying(100) NOT NULL,
        "version" integer NOT NULL,
        "operation" character varying(20) NOT NULL,
        "changes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "patient_id" uuid,
        "actor_id" uuid,
        "actor_name" character varying(200),
        "actor_role" character varying(60),
        "reason" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_record_versions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_versions_record" ON "record_versions" ("entity_name", "entity_id", "version")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_versions_facility" ON "record_versions" ("facility_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_versions_patient" ON "record_versions" ("patient_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION record_versions_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'record_versions is append-only: % is not permitted', TG_OP
          USING HINT = 'A record history that can be edited is not a history. Record a further version instead.';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "record_versions_no_update" ON "record_versions"`);
    await queryRunner.query(`
      CREATE TRIGGER "record_versions_no_update"
        BEFORE UPDATE ON "record_versions"
        FOR EACH ROW EXECUTE FUNCTION record_versions_append_only();
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "record_versions_no_delete" ON "record_versions"`);
    await queryRunner.query(`
      CREATE TRIGGER "record_versions_no_delete"
        BEFORE DELETE ON "record_versions"
        FOR EACH ROW EXECUTE FUNCTION record_versions_append_only();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "record_versions_no_delete" ON "record_versions"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "record_versions_no_update" ON "record_versions"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS record_versions_append_only()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "record_versions"`);
  }
}
