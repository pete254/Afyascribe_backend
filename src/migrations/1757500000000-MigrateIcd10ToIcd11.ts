import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace ICD-10 with ICD-11 across the system.
 *
 *  1. Create the `icd11_codes` reference dictionary (mirrors Icd11Code entity).
 *  2. Drop the old `icd10_codes` reference dictionary table.
 *  3. On `soap_notes`, swap the diagnosis columns to their icd11_* names.
 *     Old ICD-10 values are intentionally NOT carried over — the ICD-10 and
 *     ICD-11 code systems are not interchangeable, so stored codes are cleared
 *     (this is irreversible, per product decision). New columns start empty.
 *
 * Idempotent — safe to run more than once (migrationsRun applies on boot).
 */
export class MigrateIcd10ToIcd111757500000000 implements MigrationInterface {
  name = 'MigrateIcd10ToIcd111757500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. ICD-11 reference dictionary
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "icd11_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(10) NOT NULL,
        "short_description" character varying(200) NOT NULL,
        "long_description" text,
        "chapter_code" character varying(5),
        "chapter_name" character varying(200),
        "category_code" character varying(10),
        "category_name" character varying(200),
        "billable" boolean NOT NULL DEFAULT true,
        "usage_count" integer NOT NULL DEFAULT 0,
        "last_used_at" TIMESTAMP,
        "search_terms" text array NOT NULL DEFAULT '{}',
        "effective_date" date,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_icd11_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_icd11_codes_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_icd11_codes_usage" ON "icd11_codes" ("usage_count", "last_used_at")`,
    );

    // 2. Swap the soap_notes diagnosis columns (old values are cleared).
    //    Do this BEFORE dropping icd10_codes: the production DB has a foreign
    //    key (fk_icd10_code) from soap_notes.icd10_code to icd10_codes, so the
    //    dependent column must go first. Dropping the column removes the FK,
    //    but we also drop it explicitly in case it was named on the table.
    await queryRunner.query(
      `ALTER TABLE "soap_notes" ADD COLUMN IF NOT EXISTS "icd11_code" character varying(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "soap_notes" ADD COLUMN IF NOT EXISTS "icd11_description" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "soap_notes" ADD COLUMN IF NOT EXISTS "icd11_codes" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "soap_notes" DROP CONSTRAINT IF EXISTS "fk_icd10_code"`,
    );
    await queryRunner.query(`ALTER TABLE "soap_notes" DROP COLUMN IF EXISTS "icd10_code"`);
    await queryRunner.query(`ALTER TABLE "soap_notes" DROP COLUMN IF EXISTS "icd10_description"`);
    await queryRunner.query(`ALTER TABLE "soap_notes" DROP COLUMN IF EXISTS "icd10_codes"`);

    // 3. Retire the ICD-10 reference dictionary (CASCADE clears any remaining
    //    dependent objects — the only one is the FK dropped above).
    await queryRunner.query(`DROP TABLE IF EXISTS "icd10_codes" CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the ICD-10 columns (empty) and drop the ICD-11 ones.
    await queryRunner.query(
      `ALTER TABLE "soap_notes" ADD COLUMN IF NOT EXISTS "icd10_code" character varying(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "soap_notes" ADD COLUMN IF NOT EXISTS "icd10_description" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "soap_notes" ADD COLUMN IF NOT EXISTS "icd10_codes" jsonb`,
    );
    await queryRunner.query(`ALTER TABLE "soap_notes" DROP COLUMN IF EXISTS "icd11_code"`);
    await queryRunner.query(`ALTER TABLE "soap_notes" DROP COLUMN IF EXISTS "icd11_description"`);
    await queryRunner.query(`ALTER TABLE "soap_notes" DROP COLUMN IF EXISTS "icd11_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "icd11_codes"`);
  }
}
