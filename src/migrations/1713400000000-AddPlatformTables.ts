import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The AfyaScribe platform (super_admin) surface:
 *  - facility_creation_codes: the one-time codes that gate clinic creation.
 *  - support_requests: the public code-request / support / contact inbox.
 *  - facilities.subscription_due_date: when a facility's subscription is next due.
 *
 * Every statement is idempotent, so it is safe to run more than once and safe
 * on a database that already has some of this (migrationsRun applies on boot).
 */
export class AddPlatformTables1713400000000 implements MigrationInterface {
  name = 'AddPlatformTables1713400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creation_code_status_enum') THEN
          CREATE TYPE creation_code_status_enum AS ENUM ('unused', 'used', 'revoked');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_request_type_enum') THEN
          CREATE TYPE support_request_type_enum AS ENUM ('code_request', 'support', 'contact');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_request_status_enum') THEN
          CREATE TYPE support_request_status_enum AS ENUM ('open', 'in_progress', 'closed');
        END IF;
      END $$;
    `);

    // ── facility_creation_codes ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facility_creation_codes" (
        "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
        "code"        varchar(20) NOT NULL,
        "status"      creation_code_status_enum NOT NULL DEFAULT 'unused',
        "label"       varchar,
        "notes"       text,
        "facility_id" uuid,
        "created_by"  uuid,
        "used_at"     timestamptz,
        "expires_at"  timestamptz,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_facility_creation_codes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_facility_creation_codes_code"
      ON "facility_creation_codes" ("code")
    `);

    // ── support_requests ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_requests" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "type"          support_request_type_enum NOT NULL DEFAULT 'support',
        "name"          varchar NOT NULL,
        "email"         varchar NOT NULL,
        "phone"         varchar,
        "facility_name" varchar,
        "message"       text NOT NULL,
        "status"        support_request_status_enum NOT NULL DEFAULT 'open',
        "response"      text,
        "handled_by"    uuid,
        "handled_at"    timestamptz,
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_requests" PRIMARY KEY ("id")
      )
    `);

    // ── facilities.subscription_due_date ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "facilities"
      ADD COLUMN IF NOT EXISTS "subscription_due_date" timestamptz
    `);

    console.log('✅ Migration complete: platform tables and subscription_due_date ready');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "facilities" DROP COLUMN IF EXISTS "subscription_due_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "facility_creation_codes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS support_request_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS support_request_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS creation_code_status_enum`);
  }
}
