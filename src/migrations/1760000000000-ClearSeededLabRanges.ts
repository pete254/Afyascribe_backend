import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clear the reference ranges that the old starter catalogue seeded. They were
 * never taken from a published source, and a wrong range silently flags a
 * result High or Low for a clinician to act on.
 *
 * Deliberately conservative: a range is cleared only where the test name, the
 * analyte name AND both bounds still match the seeded values exactly, so any
 * range a laboratory has since verified or edited is left untouched. Results
 * already reported keep their own copy of the range they were checked against
 * (lab_result_values), which is history and is not rewritten.
 */
export class ClearSeededLabRanges1760000000000 implements MigrationInterface {
  name = 'ClearSeededLabRanges1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const res = await queryRunner.query(`
      UPDATE "lab_analytes" a
         SET ref_low = NULL, ref_high = NULL
        FROM "lab_tests" t,
             (VALUES
      ('Full Blood Count', 'WBC', 4, 11),
      ('Full Blood Count', 'RBC', 4.2, 6.1),
      ('Full Blood Count', 'Haemoglobin', 12, 17),
      ('Full Blood Count', 'Haematocrit', 36, 50),
      ('Full Blood Count', 'Platelets', 150, 450),
      ('Full Blood Count', 'MCV', 80, 100),
      ('Random Blood Sugar', 'Glucose (random)', 3.9, 7.8),
      ('Fasting Blood Sugar', 'Glucose (fasting)', 3.9, 5.5),
      ('Urea, Electrolytes & Creatinine', 'Urea', 2.5, 7.1),
      ('Urea, Electrolytes & Creatinine', 'Creatinine', 62, 106),
      ('Urea, Electrolytes & Creatinine', 'Sodium', 135, 145),
      ('Urea, Electrolytes & Creatinine', 'Potassium', 3.5, 5.1),
      ('Urea, Electrolytes & Creatinine', 'Chloride', 98, 107),
      ('Liver Function Tests', 'Total bilirubin', 0, 21),
      ('Liver Function Tests', 'ALT', 0, 41),
      ('Liver Function Tests', 'AST', 0, 40),
      ('Liver Function Tests', 'ALP', 40, 129),
      ('Liver Function Tests', 'Albumin', 35, 52)
             ) AS seeded(test_name, analyte_name, lo, hi)
       WHERE a.lab_test_id = t.id
         AND t.name = seeded.test_name
         AND a.name = seeded.analyte_name
         AND a.ref_low = seeded.lo::numeric
         AND a.ref_high = seeded.hi::numeric
      RETURNING a.id
    `);
    const n = Array.isArray(res) ? res.length : 0;
    console.log(`Cleared ${n} seeded lab reference range(s); edited ranges left untouched.`);
  }

  public async down(): Promise<void> {
    // Intentionally irreversible: restoring unsourced ranges would reintroduce
    // the clinical risk this migration exists to remove.
  }
}
