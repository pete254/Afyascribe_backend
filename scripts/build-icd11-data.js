/**
 * Convert the crawled icd11-mms.json into the compile-safe TS data module
 * src/icd11/data/icd11-mms.data.ts that the seed migration imports.
 *
 * Run after scripts/fetch-all-icd11.js:
 *   node scripts/build-icd11-data.js
 */
const fs = require('fs');
const path = require('path');

const IN = path.join(__dirname, '..', 'src', 'icd11', 'data', 'icd11-mms.json');
const OUT = path.join(__dirname, '..', 'src', 'icd11', 'data', 'icd11-mms.data.ts');

const d = JSON.parse(fs.readFileSync(IN, 'utf8'));
// Keep real diagnosable codes; drop the 2-char chapter headers.
const rows = d.codes
  .filter((c) => c.code && c.code.length >= 4)
  .map((c) => ({ code: c.code, short_description: c.short_description, chapter_code: c.chapter_code || null }));

const jsonText = JSON.stringify(rows);
const ts =
  `// AUTO-GENERATED from the official WHO ICD-11 MMS API (release ${d.release}).\n` +
  `// ${rows.length} codes. Regenerate: node scripts/fetch-all-icd11.js && node scripts/build-icd11-data.js\n` +
  `// Source: https://icd.who.int — authoritative WHO data.\n` +
  `export interface Icd11Row { code: string; short_description: string; chapter_code: string | null }\n` +
  `export const ICD11_MMS: Icd11Row[] = JSON.parse(${JSON.stringify(jsonText)});\n`;

fs.writeFileSync(OUT, ts);
console.log(`Wrote ${rows.length} rows to ${OUT}`);
