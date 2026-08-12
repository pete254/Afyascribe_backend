import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Practitioner registration numbers (e.g. "P#A0000") for doctors and
 * pharmacists — printed on prescriptions in place of a signature. Adds the
 * column on users (and a snapshot on prescriptions), and seeds every existing
 * doctor/pharmacist a sequential number. Idempotent.
 */
export class AddPractitionerNo1715400000000 implements MigrationInterface {
  name = 'AddPractitionerNo1715400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS practitioner_no varchar(30)`);
    await queryRunner.query(`ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS doctor_no varchar(30)`);

    // Seed existing doctors & pharmacists a sequential P#A0000, P#A0001, …
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, row_number() OVER (ORDER BY "createdAt", id) - 1 AS rn
        FROM users
        WHERE practitioner_no IS NULL
          AND (
            role IN ('doctor', 'pharmacist')
            OR (roles IS NOT NULL AND (roles @> '"doctor"'::jsonb OR roles @> '"pharmacist"'::jsonb))
          )
      )
      UPDATE users u
         SET practitioner_no = 'P#A' || lpad(r.rn::text, 4, '0')
        FROM ranked r
       WHERE u.id = r.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE prescriptions DROP COLUMN IF EXISTS doctor_no`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS practitioner_no`);
  }
}
