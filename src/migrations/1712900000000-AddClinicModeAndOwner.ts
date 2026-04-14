// src/migrations/1712900000000-AddClinicModeAndOwner.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClinicModeAndOwner1712900000000 implements MigrationInterface {
  name = 'AddClinicModeAndOwner1712900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add clinic_mode_enum type
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinic_mode_enum') THEN
          CREATE TYPE clinic_mode_enum AS ENUM ('solo', 'team', 'multi');
        END IF;
      END$$;
    `);

    // 2. Add clinic_mode column to facilities table (default = 'multi' so nothing breaks)
    await queryRunner.query(`
      ALTER TABLE "facilities"
      ADD COLUMN IF NOT EXISTS "clinic_mode" clinic_mode_enum NOT NULL DEFAULT 'multi'
    `);

    // 3. Add is_owner column to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "is_owner" boolean NOT NULL DEFAULT false
    `);

    console.log('✅ Migration complete: clinic_mode and is_owner added');
    console.log('   All existing facilities default to "multi" mode — no behaviour change.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_owner"`);
    await queryRunner.query(`ALTER TABLE "facilities" DROP COLUMN IF EXISTS "clinic_mode"`);
    // Leave the enum type in place (safe to keep)
  }
}