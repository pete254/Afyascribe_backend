// src/migrations/1713100000000-AddSelfRegistrations.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient self-registration: submissions from the facility's QR poster, held
 * for front-desk review. Purely additive — no existing table is touched, so
 * nothing changes for facilities that never display the poster.
 */
export class AddSelfRegistrations1713100000000 implements MigrationInterface {
  name = 'AddSelfRegistrations1713100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "self_registrations" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"         character varying(12) NOT NULL,
        "facilityId"   uuid NOT NULL,
        "firstName"    character varying NOT NULL,
        "middleName"   character varying,
        "lastName"     character varying NOT NULL,
        "gender"       character varying,
        "dateOfBirth"  character varying,
        "phoneNumber"  character varying,
        "email"        character varying,
        "idNumber"     character varying,
        "membershipNo" character varying,
        "medicalPlan"  character varying,
        "status"       character varying(20) NOT NULL DEFAULT 'pending',
        "expiresAt"    TIMESTAMP NOT NULL,
        "patientId"    uuid,
        "merged"       boolean NOT NULL DEFAULT false,
        "reviewedBy"   uuid,
        "reviewedAt"   TIMESTAMP,
        "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_self_registrations_facility"
          FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE
      )
    `);

    // The code is the patient's claim ticket — it must be unique to look up.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_self_registrations_code"
      ON "self_registrations" ("code")
    `);

    // The front desk lists its own facility's pending submissions constantly.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_self_registrations_facility_status"
      ON "self_registrations" ("facilityId", "status")
    `);

    console.log('✅ Migration complete: self_registrations table created');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_self_registrations_facility_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_self_registrations_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "self_registrations"`);
  }
}
