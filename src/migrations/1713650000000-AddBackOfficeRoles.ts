import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the back-office roles (accountant, cashier, procurement_officer,
 * storekeeper, hr_manager) to the users.role enum.
 *
 * Resolves the enum type name dynamically from the column so it works whatever
 * TypeORM named it, and only touches a genuine enum type — a no-op otherwise.
 * Postgres enum values cannot be removed, so there is no meaningful down().
 */
export class AddBackOfficeRoles1713650000000 implements MigrationInterface {
  name = 'AddBackOfficeRoles1713650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        enum_type text;
        v text;
        vals text[] := ARRAY['accountant','cashier','procurement_officer','storekeeper','hr_manager'];
      BEGIN
        SELECT t.typname INTO enum_type
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE a.attrelid = 'users'::regclass AND a.attname = 'role' AND t.typtype = 'e';

        IF enum_type IS NULL THEN
          RETURN;
        END IF;

        FOREACH v IN ARRAY vals LOOP
          EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, v);
        END LOOP;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Enum values cannot be dropped without recreating the type; intentionally a no-op.
  }
}
