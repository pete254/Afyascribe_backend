import { MigrationInterface, QueryRunner } from 'typeorm';

/** Nursing kardex — the medication administration record (MAR). */
export class AddKardex1716000000000 implements MigrationInterface {
  name = 'AddKardex1716000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "medication_administrations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "admission_id" uuid,
        "prescription_id" uuid,
        "prescription_item_id" uuid,
        "medication" varchar NOT NULL,
        "dose" varchar,
        "route" varchar,
        "frequency" varchar,
        "scheduled_at" TIMESTAMP WITH TIME ZONE,
        "administered_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'given',
        "administered_by_id" uuid,
        "administered_by_name" varchar,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mar_facility_patient" ON "medication_administrations" ("facility_id", "patient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mar_facility_admission" ON "medication_administrations" ("facility_id", "admission_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "medication_administrations"`);
  }
}
