import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-practitioner signing keys, and signatures over clinical records.
 * Idempotent.
 *
 * Both tables are append-only. A signature that could be edited would prove
 * nothing, and a key that could be edited would let someone else's signature
 * be made to verify.
 */
export class AddDigitalSignatures1762100000000 implements MigrationInterface {
  name = 'AddDigitalSignatures1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "practitioner_keys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "facility_id" uuid,
        "public_key" text NOT NULL,
        "encrypted_private_key" text NOT NULL,
        "salt" character varying(64) NOT NULL,
        "iv" character varying(64) NOT NULL,
        "auth_tag" character varying(64) NOT NULL,
        "fingerprint" character varying(32) NOT NULL,
        "algorithm" character varying(20) NOT NULL DEFAULT 'Ed25519',
        "practitioner_no" character varying(60),
        "regulatory_body" character varying(40),
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "revoked_reason" character varying(300),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_practitioner_keys" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_practitioner_keys_user" ON "practitioner_keys" ("user_id", "revoked_at")`,
    );
    // One key in use per practitioner; rotation revokes before it creates.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_practitioner_keys_active" ON "practitioner_keys" ("user_id") WHERE "revoked_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "record_signatures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid,
        "entity_name" character varying(80) NOT NULL,
        "entity_id" character varying(100) NOT NULL,
        "purpose" character varying(30) NOT NULL DEFAULT 'authored',
        "payload_hash" char(64) NOT NULL,
        "signature" text NOT NULL,
        "key_id" uuid NOT NULL,
        "public_key" text NOT NULL,
        "fingerprint" character varying(32) NOT NULL,
        "signed_by_id" uuid NOT NULL,
        "signed_by_name" character varying(200),
        "practitioner_no" character varying(60),
        "signed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_record_signatures" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_signatures_record" ON "record_signatures" ("entity_name", "entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_record_signatures_facility" ON "record_signatures" ("facility_id", "signed_at")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION signatures_append_only() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
          USING HINT = 'A signature that can be edited proves nothing. Revoke and re-sign instead.';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "record_signatures_no_change" ON "record_signatures"`);
    await queryRunner.query(`
      CREATE TRIGGER "record_signatures_no_change"
        BEFORE UPDATE OR DELETE ON "record_signatures"
        FOR EACH ROW EXECUTE FUNCTION signatures_append_only();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "record_signatures_no_change" ON "record_signatures"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS signatures_append_only()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "record_signatures"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "practitioner_keys"`);
  }
}
