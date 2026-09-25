import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tamper-evidence for the audit ledger, and the quarterly review it is meant
 * to feed. Idempotent.
 *
 * Kenya's Digital Health (Health Information Management Procedures)
 * Regulations, 2025 require all user actions and data access to be logged "in
 * a secure and tamper-proof manner", retained for twenty years, and reviewed
 * quarterly. Three things follow from that:
 *
 *  - every line is chained to the one before it (see chain.ts);
 *  - the table refuses UPDATE and DELETE outright, so tampering has to start
 *    by removing the guard rather than by editing a row;
 *  - the review is itself recorded.
 */
export class HardenAuditTrail1761200000000 implements MigrationInterface {
  name = 'HardenAuditTrail1761200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "category" character varying(10) NOT NULL DEFAULT 'write'`);
    await queryRunner.query(`ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "patient_id" uuid`);
    await queryRunner.query(`ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "seq" bigint`);
    await queryRunner.query(`ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "hash" char(64)`);
    await queryRunner.query(`ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "prev_hash" char(64)`);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_patient" ON "audit_events" ("patient_id", "created_at")`,
    );
    // A repeated sequence number would let one line quietly stand in for another.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_audit_seq" ON "audit_events" ("seq") WHERE "seq" IS NOT NULL`,
    );

    // Lines written before the chain existed keep their content and are left
    // unhashed. Back-filling hashes now would be a lie: it would assert an
    // integrity guarantee over a period when none was being kept. Verification
    // reports them as unhashed instead, which is the truth.

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP
          USING HINT = 'The audit ledger is a legal record. Correct an error by recording a further line, never by changing one.';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "audit_events_no_update" ON "audit_events"`);
    await queryRunner.query(`
      CREATE TRIGGER "audit_events_no_update"
        BEFORE UPDATE ON "audit_events"
        FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "audit_events_no_delete" ON "audit_events"`);
    await queryRunner.query(`
      CREATE TRIGGER "audit_events_no_delete"
        BEFORE DELETE ON "audit_events"
        FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "period_from" date NOT NULL,
        "period_to" date NOT NULL,
        "reviewed_by_id" uuid,
        "reviewed_by_name" character varying(200),
        "lines_reviewed" integer,
        "chain_ok" boolean,
        "chain_verdict" jsonb,
        "concerns_found" boolean NOT NULL DEFAULT false,
        "findings" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_reviews" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_reviews_period" ON "audit_reviews" ("facility_id", "period_to")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "audit_events_no_delete" ON "audit_events"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "audit_events_no_update" ON "audit_events"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS audit_events_append_only()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_reviews"`);
    // The columns are left in place: dropping them would destroy the evidence
    // this migration exists to protect.
  }
}
