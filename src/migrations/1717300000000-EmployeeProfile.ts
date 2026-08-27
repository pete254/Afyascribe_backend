import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employee HR profile — next-of-kin contacts on the employee, and an
 * employee_documents table for qualifications, certificates, application
 * letters and contracts (stored on Cloudinary).
 */
export class EmployeeProfile1717300000000 implements MigrationInterface {
  name = 'EmployeeProfile1717300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "next_of_kin" jsonb`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "facility_id" uuid NOT NULL,
        "employee_id" uuid NOT NULL,
        "uploaded_by_id" uuid,
        "document_name" character varying(500) NOT NULL,
        "category" character varying(40) NOT NULL DEFAULT 'other',
        "notes" text,
        "file_url" text NOT NULL,
        "public_id" character varying(255) NOT NULL,
        "file_name" character varying(500) NOT NULL,
        "file_type" character varying(50) NOT NULL,
        "file_size" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_employee_documents_facility_employee" ON "employee_documents" ("facility_id", "employee_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_documents_facility_employee"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_documents"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN IF EXISTS "next_of_kin"`);
  }
}
