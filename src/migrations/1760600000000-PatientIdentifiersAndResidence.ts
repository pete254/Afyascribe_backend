import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A patient may hold several identifiers — a child has a birth certificate and
 * later a national ID, a refugee holds a refugee ID and perhaps an alien ID —
 * but the record had room for exactly one. Adds a typed identifier table, and
 * fills it from the existing idType/idNumber so nothing is lost.
 *
 * Also completes the residence hierarchy (ward, village, physical address),
 * which stopped at sub-county. Idempotent.
 */
export class PatientIdentifiersAndResidence1760600000000 implements MigrationInterface {
  name = 'PatientIdentifiersAndResidence1760600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patient_identifiers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "type" character varying(40) NOT NULL,
        "type_system" character varying(40),
        "value" character varying(100) NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patient_identifiers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_patient_identifiers_patient" ON "patient_identifiers" ("facility_id", "patient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_patient_identifiers_lookup" ON "patient_identifiers" ("facility_id", "type", "value")`,
    );

    for (const col of ['ward', 'village', 'physical_address']) {
      await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "${col}" character varying`);
    }

    // Carry the single identifier each patient already has into the new table,
    // mapping the free-text type onto the national codes where it is recognised.
    await queryRunner.query(`
      INSERT INTO "patient_identifiers" (facility_id, patient_id, type, type_system, value, is_primary)
      SELECT p."facilityId", p.id,
             CASE lower(regexp_replace(coalesce(p."idType", ''), '[\\s_-]', '', 'g'))
               WHEN 'nationalid' THEN 'nationalID'
               WHEN 'national' THEN 'nationalID'
               WHEN 'id' THEN 'nationalID'
               WHEN 'idcard' THEN 'nationalID'
               WHEN 'passport' THEN 'passportID'
               WHEN 'passportnumber' THEN 'passportID'
               WHEN 'alien' THEN 'alienID'
               WHEN 'alienid' THEN 'alienID'
               WHEN 'military' THEN 'militaryID'
               WHEN 'militaryid' THEN 'militaryID'
               WHEN 'birthcertificate' THEN 'birthCertificate'
               WHEN 'birthcert' THEN 'birthCertificate'
               WHEN 'birthnotification' THEN 'birthNotification'
               WHEN 'refugee' THEN 'refugeeID'
               WHEN 'refugeeid' THEN 'refugeeID'
               WHEN 'kra' THEN 'kraPIN'
               WHEN 'krapin' THEN 'kraPIN'
               ELSE 'nationalID'
             END,
             CASE lower(regexp_replace(coalesce(p."idType", ''), '[\\s_-]', '', 'g'))
               WHEN 'birthcertificate' THEN NULL
               WHEN 'birthcert' THEN NULL
               WHEN 'birthnotification' THEN NULL
               WHEN 'refugee' THEN NULL
               WHEN 'refugeeid' THEN NULL
               ELSE 'ORG-00001-SRC-016'
             END,
             p."idNumber", true
        FROM "patients" p
       WHERE p."idNumber" IS NOT NULL
         AND trim(p."idNumber") <> ''
         AND p."facilityId" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "patient_identifiers" i WHERE i.patient_id = p.id
         )
    `);

    // The SHA number is an identifier in its own right.
    await queryRunner.query(`
      INSERT INTO "patient_identifiers" (facility_id, patient_id, type, type_system, value, is_primary)
      SELECT p."facilityId", p.id, 'shaNumber', 'ORG-00001-SRC-016', p."sha_number", false
        FROM "patients" p
       WHERE p."sha_number" IS NOT NULL
         AND trim(p."sha_number") <> ''
         AND p."facilityId" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "patient_identifiers" i
            WHERE i.patient_id = p.id AND i.type = 'shaNumber'
         )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patient_identifiers"`);
    for (const col of ['physical_address', 'village', 'ward']) {
      await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
