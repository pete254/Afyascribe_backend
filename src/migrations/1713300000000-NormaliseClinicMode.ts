// src/migrations/1713300000000-NormaliseClinicMode.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the clinic_mode column consistent now that the Facility entity finally
 * declares it.
 *
 * Background: AddClinicModeAndOwner added the column, but the entity never had
 * a matching property, so TypeORM neither selected nor wrote it. Every login
 * issued `clinicMode: null` and the whole solo/team capability system was
 * inert. The entity now declares it, and this migration makes sure the data
 * underneath is in the shape the entity expects — the type exists, the column
 * exists, there are no NULLs, and no value outside the enum.
 *
 * Safe to run more than once and safe on a database where the column is
 * already correct: every statement is conditional or idempotent.
 *
 * What this CANNOT do is restore the mode each clinic originally chose. The
 * create-clinic flow wrote it through a try/catch that swallowed the failure,
 * so that choice was never persisted for any facility. Everyone lands on
 * 'multi' — the safe default, since it is the least permissive — and owners
 * re-pick their practice type in Facility settings.
 */
export class NormaliseClinicMode1713300000000 implements MigrationInterface {
  name = 'NormaliseClinicMode1713300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The enum type, in case this database predates AddClinicModeAndOwner.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinic_mode_enum') THEN
          CREATE TYPE clinic_mode_enum AS ENUM ('solo', 'team', 'multi');
        END IF;
      END$$;
    `);

    // 2. The column itself.
    await queryRunner.query(`
      ALTER TABLE "facilities"
      ADD COLUMN IF NOT EXISTS "clinic_mode" clinic_mode_enum NOT NULL DEFAULT 'multi'
    `);

    // 3. Backfill anything null — possible if the column was added without a
    //    default on some environment, or rows were inserted around it.
    await queryRunner.query(`
      UPDATE "facilities" SET "clinic_mode" = 'multi' WHERE "clinic_mode" IS NULL
    `);

    // 4. Re-assert the constraints the entity assumes.
    await queryRunner.query(`
      ALTER TABLE "facilities" ALTER COLUMN "clinic_mode" SET DEFAULT 'multi'
    `);
    await queryRunner.query(`
      ALTER TABLE "facilities" ALTER COLUMN "clinic_mode" SET NOT NULL
    `);

    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM "facilities"`,
    )) as { count: number }[];

    console.log('✅ Migration complete: clinic_mode normalised');
    console.log(`   ${count} facilities present; any without a mode now read 'multi'.`);
    console.log("   Owners set their practice type under Facility settings.");
  }

  public async down(): Promise<void> {
    // Nothing to undo: this only guarantees a column that other migrations own.
    // Dropping it here would destroy data those migrations created.
  }
}
