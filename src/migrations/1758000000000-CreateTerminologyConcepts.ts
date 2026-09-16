import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The KNHTS terminology mirror: concepts synced from the Kenya National Health
 * Terminology Service (Open Concept Lab). Populated by scripts/sync-terminology.ts
 * or POST /terminology/sync — not by this migration (the sources are large and
 * fetched from the national service at runtime).
 *
 * A pg_trgm GIN index keeps ILIKE search fast across hundreds of thousands of
 * concepts; it's created best-effort (skipped if the extension can't be added).
 */
export class CreateTerminologyConcepts1758000000000 implements MigrationInterface {
  name = 'CreateTerminologyConcepts1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "terminology_concepts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "org" character varying(64) NOT NULL,
        "system" character varying(64) NOT NULL,
        "code" character varying(64) NOT NULL,
        "display" text NOT NULL,
        "domain" character varying(32) NOT NULL,
        "concept_class" character varying(64),
        "datatype" character varying(64),
        "synonyms" text array NOT NULL DEFAULT '{}',
        "extras" jsonb,
        "retired" boolean NOT NULL DEFAULT false,
        "source_updated_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_terminology_concepts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_terminology_org_system_code" UNIQUE ("org", "system", "code")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_terminology_domain_system" ON "terminology_concepts" ("domain", "system")`,
    );
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_terminology_display_trgm" ON "terminology_concepts" USING gin ("display" gin_trgm_ops)`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_terminology_code_trgm" ON "terminology_concepts" USING gin ("code" gin_trgm_ops)`,
      );
    } catch {
      // pg_trgm unavailable — ILIKE still works, just without the GIN index.
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "terminology_concepts"`);
  }
}
