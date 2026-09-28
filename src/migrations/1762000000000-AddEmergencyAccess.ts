import { MigrationInterface, QueryRunner } from 'typeorm';

/** Restricted records, and the break-glass access that opens them. Idempotent. */
export class AddEmergencyAccess1762000000000 implements MigrationInterface {
  name = 'AddEmergencyAccess1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "restricted" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "restricted_reason" character varying(300)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "emergency_access" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "user_name" character varying(200),
        "user_role" character varying(60),
        "reason" text NOT NULL,
        "granted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "reviewed" boolean NOT NULL DEFAULT false,
        "review_note" text,
        "reviewed_by_name" character varying(200),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_emergency_access" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emergency_access_patient" ON "emergency_access" ("facility_id", "patient_id", "expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emergency_access_review" ON "emergency_access" ("facility_id", "reviewed")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "emergency_access"`);
    // The patient columns stay: dropping them would unrestrict every record
    // that had been deliberately withheld.
  }
}
