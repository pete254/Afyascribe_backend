import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Uploaded files move from Cloudinary to this server's disk. Each file gets a
 * storage key; the Cloudinary columns become optional and are emptied as
 * deploy/import-cloudinary.js moves each file across. Idempotent.
 */
export class UploadsOnServer1762300000000 implements MigrationInterface {
  name = 'UploadsOnServer1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['patient_documents', 'employee_documents']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "storage_key" varchar(255)`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "file_url" DROP NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "public_id" DROP NOT NULL`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "logo_key" varchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "facilities" DROP COLUMN IF EXISTS "logo_key"`,
    );
    for (const table of ['patient_documents', 'employee_documents']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "storage_key"`,
      );
    }
  }
}
