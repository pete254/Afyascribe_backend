/**
 * A starter catalogue of common tests, seeded on demand for a new facility.
 *
 * **No numeric reference ranges are supplied.** A range depends on the
 * analyser, method, population, age and sex, so a generic number is unsafe to
 * flag results against — LOINC deliberately omits them for the same reason.
 * Each laboratory enters its own ranges in the test catalogue (Lab › Catalogue
 * shows "ranges needed" until it does). `refText` is kept only where the
 * expected result of a qualitative screening test is categorical (Negative),
 * which is what makes a positive result flag as abnormal.
 */
export interface SeedAnalyte {
  name: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
}
export interface SeedTest {
  code: string;
  name: string;
  specimen: string;
  department: string;
  price?: number;
  analytes: SeedAnalyte[];
}

export const LAB_TEST_SEED: SeedTest[] = [
  {
    code: 'FBC',
    name: 'Full Blood Count',
    specimen: 'blood',
    department: 'haematology',
    analytes: [
      { name: 'WBC', unit: '10^9/L' },
      { name: 'RBC', unit: '10^12/L' },
      { name: 'Haemoglobin', unit: 'g/dL' },
      { name: 'Haematocrit', unit: '%' },
      { name: 'Platelets', unit: '10^9/L' },
      { name: 'MCV', unit: 'fL' },
    ],
  },
  {
    code: 'MPS',
    name: 'Malaria Parasites (BS)',
    specimen: 'blood',
    department: 'parasitology',
    analytes: [{ name: 'Malaria parasites', refText: 'Negative' }],
  },
  {
    code: 'RBS',
    name: 'Random Blood Sugar',
    specimen: 'blood',
    department: 'chemistry',
    analytes: [{ name: 'Glucose (random)', unit: 'mmol/L' }],
  },
  {
    code: 'FBS',
    name: 'Fasting Blood Sugar',
    specimen: 'blood',
    department: 'chemistry',
    analytes: [{ name: 'Glucose (fasting)', unit: 'mmol/L' }],
  },
  {
    code: 'UECR',
    name: 'Urea, Electrolytes & Creatinine',
    specimen: 'serum',
    department: 'chemistry',
    analytes: [
      { name: 'Urea', unit: 'mmol/L' },
      { name: 'Creatinine', unit: 'umol/L' },
      { name: 'Sodium', unit: 'mmol/L' },
      { name: 'Potassium', unit: 'mmol/L' },
      { name: 'Chloride', unit: 'mmol/L' },
    ],
  },
  {
    code: 'LFT',
    name: 'Liver Function Tests',
    specimen: 'serum',
    department: 'chemistry',
    analytes: [
      { name: 'Total bilirubin', unit: 'umol/L' },
      { name: 'ALT', unit: 'U/L' },
      { name: 'AST', unit: 'U/L' },
      { name: 'ALP', unit: 'U/L' },
      { name: 'Albumin', unit: 'g/L' },
    ],
  },
  {
    code: 'URIN',
    name: 'Urinalysis',
    specimen: 'urine',
    department: 'chemistry',
    analytes: [
      { name: 'Colour' },
      { name: 'Appearance' },
      { name: 'Glucose', refText: 'Negative' },
      { name: 'Protein', refText: 'Negative' },
      { name: 'Leucocytes', refText: 'Negative' },
      { name: 'Nitrites', refText: 'Negative' },
    ],
  },
  {
    code: 'HIV',
    name: 'HIV Test',
    specimen: 'blood',
    department: 'serology',
    analytes: [{ name: 'HIV antibody', refText: 'Negative' }],
  },
  {
    code: 'HPYL',
    name: 'H. pylori Antigen',
    specimen: 'stool',
    department: 'serology',
    analytes: [{ name: 'H. pylori antigen', refText: 'Negative' }],
  },
  {
    code: 'PREG',
    name: 'Pregnancy Test (hCG)',
    specimen: 'urine',
    department: 'serology',
    analytes: [{ name: 'Urine hCG', refText: 'Negative' }],
  },
];
