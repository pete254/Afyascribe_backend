import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registers the 'radiology' value on the patient_documents.scope enum so
 * images/films can be filed against a radiology study. Without it, any query or
 * insert with scope='radiology' fails ("invalid input value for enum") — the
 * cause of the 500 on the study's Images & films panel.
 *
 * Resolves the enum type name dynamically from the column (TypeORM's naming
 * varies), only touches a genuine enum type, and is idempotent.
 */
export class AddRadiologyDocumentScope1717900000000 implements MigrationInterface {
  name = 'AddRadiologyDocumentScope1717900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        enum_type text;
      BEGIN
        SELECT t.typname INTO enum_type
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE a.attrelid = 'patient_documents'::regclass AND a.attname = 'scope' AND t.typtype = 'e';

        IF enum_type IS NULL THEN
          RETURN;
        END IF;

        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, 'radiology');
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Enum values cannot be dropped without recreating the type; a no-op.
  }
}
