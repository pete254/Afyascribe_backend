import { MigrationInterface, QueryRunner } from 'typeorm';

/** System-wide audit ledger: who did what write action, to which record, when. */
export class AuditEvents1716500000000 implements MigrationInterface {
  name = 'AuditEvents1716500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid,
        "actor_id" uuid,
        "actor_name" character varying(200),
        "actor_role" character varying(60),
        "method" character varying(10) NOT NULL,
        "path" text NOT NULL,
        "action" character varying(140) NOT NULL,
        "entity_type" character varying(60),
        "entity_id" character varying(100),
        "status_code" integer,
        "ip" character varying(60),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_events" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_facility_created" ON "audit_events" ("facility_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_facility_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
  }
}
