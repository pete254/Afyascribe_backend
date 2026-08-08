/**
 * A starter catalog of common tests with typical adult reference ranges, seeded
 * on demand for a new facility. Ranges are indicative and can be edited per
 * facility to match its own laboratory's method and population.
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
      { name: 'WBC', unit: '10^9/L', refLow: 4, refHigh: 11 },
      { name: 'RBC', unit: '10^12/L', refLow: 4.2, refHigh: 6.1 },
      { name: 'Haemoglobin', unit: 'g/dL', refLow: 12, refHigh: 17 },
      { name: 'Haematocrit', unit: '%', refLow: 36, refHigh: 50 },
      { name: 'Platelets', unit: '10^9/L', refLow: 150, refHigh: 450 },
      { name: 'MCV', unit: 'fL', refLow: 80, refHigh: 100 },
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
    analytes: [{ name: 'Glucose (random)', unit: 'mmol/L', refLow: 3.9, refHigh: 7.8 }],
  },
  {
    code: 'FBS',
    name: 'Fasting Blood Sugar',
    specimen: 'blood',
    department: 'chemistry',
    analytes: [{ name: 'Glucose (fasting)', unit: 'mmol/L', refLow: 3.9, refHigh: 5.5 }],
  },
  {
    code: 'UECR',
    name: 'Urea, Electrolytes & Creatinine',
    specimen: 'serum',
    department: 'chemistry',
    analytes: [
      { name: 'Urea', unit: 'mmol/L', refLow: 2.5, refHigh: 7.1 },
      { name: 'Creatinine', unit: 'umol/L', refLow: 62, refHigh: 106 },
      { name: 'Sodium', unit: 'mmol/L', refLow: 135, refHigh: 145 },
      { name: 'Potassium', unit: 'mmol/L', refLow: 3.5, refHigh: 5.1 },
      { name: 'Chloride', unit: 'mmol/L', refLow: 98, refHigh: 107 },
    ],
  },
  {
    code: 'LFT',
    name: 'Liver Function Tests',
    specimen: 'serum',
    department: 'chemistry',
    analytes: [
      { name: 'Total bilirubin', unit: 'umol/L', refLow: 0, refHigh: 21 },
      { name: 'ALT', unit: 'U/L', refLow: 0, refHigh: 41 },
      { name: 'AST', unit: 'U/L', refLow: 0, refHigh: 40 },
      { name: 'ALP', unit: 'U/L', refLow: 40, refHigh: 129 },
      { name: 'Albumin', unit: 'g/L', refLow: 35, refHigh: 52 },
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
