import { MigrationInterface, QueryRunner } from 'typeorm';
import { ICD11_MMS } from '../icd11/data/icd11-mms.data';

/**
 * Populate icd11_codes with the full ICD-11 MMS linearization (~35k codes)
 * pulled from the official WHO ICD API (see scripts/fetch-all-icd11.js).
 *
 * Idempotent: ON CONFLICT (code) DO NOTHING, and inserts in chunks so it fits
 * comfortably in the Render instance's memory. Safe to re-run.
 */
export class SeedIcd11AllCodes1757600000000 implements MigrationInterface {
  name = 'SeedIcd11AllCodes1757600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A few WHO titles exceed 200 chars (longest is 212), so widen the column
    // to text before loading. Also widen the note's copy of the description.
    await queryRunner.query(`ALTER TABLE "icd11_codes" ALTER COLUMN "short_description" TYPE text`);
    await queryRunner.query(`ALTER TABLE "soap_notes" ALTER COLUMN "icd11_description" TYPE varchar(300)`);

    const CHUNK = 1000;
    let inserted = 0;
    for (let i = 0; i < ICD11_MMS.length; i += CHUNK) {
      const chunk = ICD11_MMS.slice(i, i + CHUNK);
      const values: string[] = [];
      const params: (string | null)[] = [];
      chunk.forEach((row, j) => {
        const b = j * 4;
        values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
        params.push(row.code, row.short_description, row.short_description, row.chapter_code);
      });
      const res = await queryRunner.query(
        `INSERT INTO "icd11_codes" ("code", "short_description", "long_description", "chapter_code")
         VALUES ${values.join(', ')}
         ON CONFLICT ("code") DO NOTHING`,
        params,
      );
      // pg returns rowCount via the driver; TypeORM's raw query returns rows, so
      // we just count attempted — actual inserts skip existing codes.
      inserted += chunk.length;
    }
    // eslint-disable-next-line no-console
    console.log(`SeedIcd11AllCodes: processed ${inserted} ICD-11 codes`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove only the bulk-loaded set (leave any manually added rows untouched
    // is not feasible by origin, so clear the table). Safe because the table is
    // a reference dictionary re-populated by this migration.
    await queryRunner.query(`TRUNCATE TABLE "icd11_codes"`);
  }
}
