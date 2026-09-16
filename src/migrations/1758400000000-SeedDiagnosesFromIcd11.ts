import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconcile diagnoses onto the unified KNHTS terminology mirror: copy the
 * existing icd11_codes rows into terminology_concepts as WHO/ICD-11
 * (domain diagnosis). This makes the mirror the single source for diagnoses
 * immediately — the /icd11 API now reads from it — without waiting for the
 * OCL sync, which can later refresh/augment the same rows. Idempotent.
 */
export class SeedDiagnosesFromIcd111758400000000 implements MigrationInterface {
  name = 'SeedDiagnosesFromIcd111758400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(`SELECT to_regclass('public.icd11_codes') AS t`);
    if (!exists?.[0]?.t) return; // no legacy table (fresh env) — nothing to copy

    await queryRunner.query(`
      INSERT INTO "terminology_concepts"
        ("org", "system", "code", "display", "domain", "synonyms", "retired")
      SELECT 'WHO', 'ICD-11', "code", "short_description", 'diagnosis',
             COALESCE("search_terms", '{}'), NOT COALESCE("is_active", true)
      FROM "icd11_codes"
      ON CONFLICT ("org", "system", "code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "terminology_concepts" WHERE "org" = 'WHO' AND "system" = 'ICD-11'`,
    );
  }
}
