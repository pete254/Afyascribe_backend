import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tier on a mirrored concept, so a picker can ask for the right level of a
 * tiered dictionary. Backfills HPT from its code prefixes: GE generic,
 * PH product, FS brand, AC active component, DF/UM/RT reference. Idempotent.
 */
export class AddTerminologyTier1760300000000 implements MigrationInterface {
  name = 'AddTerminologyTier1760300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "terminology_concepts" ADD COLUMN IF NOT EXISTS "tier" character varying(20)`);
    const map: [string, string][] = [
      ['GE%', 'generic'],
      ['PH%', 'product'],
      ['FS%', 'brand'],
      ['AC%', 'component'],
      ['DF%', 'reference'],
      ['UM%', 'reference'],
      ['RT%', 'reference'],
    ];
    for (const [prefix, tier] of map) {
      await queryRunner.query(
        `UPDATE "terminology_concepts" SET tier = $1 WHERE system = 'HPT' AND code LIKE $2 AND tier IS NULL`,
        [tier, prefix],
      );
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_terminology_system_tier" ON "terminology_concepts" ("system", "tier")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_terminology_system_tier"`);
    await queryRunner.query(`ALTER TABLE "terminology_concepts" DROP COLUMN IF EXISTS "tier"`);
  }
}
