/**
 * Fetch authoritative ICD-11 MMS codes from the official WHO ICD API and
 * regenerate src/icd11/seeds/common-icd11-codes.seed.ts.
 *
 * Usage:
 *   ICD11_CLIENT_ID=... ICD11_CLIENT_SECRET=... npx ts-node scripts/fetch-icd11-codes.ts
 *
 * The credentials come from a free WHO ICD API account (https://icd.who.int/icdapi)
 * and are read from the environment only — never stored in the repo.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

const TOKEN_ENDPOINT = 'https://icdaccessmanagement.who.int/connect/token';

// Conditions we want, with local search aliases. The WHO API supplies the real
// MMS code and official title for each; the aliases only feed our local search.
const CONDITIONS: { query: string; aliases: string[] }[] = [
  { query: 'Cholera', aliases: ['cholera', 'vibrio'] },
  { query: 'Typhoid fever', aliases: ['typhoid', 'enteric fever', 'salmonella typhi'] },
  { query: 'Gastroenteritis of infectious origin', aliases: ['gastroenteritis', 'diarrhoea', 'diarrhea', 'stomach infection'] },
  { query: 'Respiratory tuberculosis', aliases: ['tb', 'tuberculosis', 'pulmonary tb', 'lung tb'] },
  { query: 'Human immunodeficiency virus disease', aliases: ['hiv', 'aids', 'immunodeficiency'] },
  { query: 'Plasmodium falciparum malaria', aliases: ['malaria', 'falciparum'] },
  { query: 'Plasmodium vivax malaria', aliases: ['malaria', 'vivax'] },
  { query: 'Malaria without parasitological confirmation', aliases: ['malaria', 'clinical malaria'] },
  { query: 'Iron deficiency anaemia', aliases: ['anaemia', 'anemia', 'iron deficiency'] },
  { query: 'Type 1 diabetes mellitus', aliases: ['diabetes', 'type 1', 't1dm', 'insulin dependent'] },
  { query: 'Type 2 diabetes mellitus', aliases: ['diabetes', 'type 2', 't2dm', 'sugar'] },
  { query: 'Depressive disorder single episode', aliases: ['depression', 'depressive', 'low mood'] },
  { query: 'Generalised anxiety disorder', aliases: ['anxiety', 'gad', 'worry'] },
  { query: 'Migraine', aliases: ['migraine', 'headache'] },
  { query: 'Conjunctivitis', aliases: ['conjunctivitis', 'red eye', 'pink eye'] },
  { query: 'Essential hypertension', aliases: ['hypertension', 'high blood pressure', 'hbp', 'bp'] },
  { query: 'Hypertensive heart disease', aliases: ['hypertensive heart disease', 'hypertension'] },
  { query: 'Acute nasopharyngitis common cold', aliases: ['common cold', 'cold', 'coryza', 'runny nose'] },
  { query: 'Acute upper respiratory infection', aliases: ['uri', 'upper respiratory infection', 'flu', 'cough'] },
  { query: 'Acute bronchitis', aliases: ['bronchitis', 'chest infection'] },
  { query: 'Chronic obstructive pulmonary disease', aliases: ['copd', 'chronic bronchitis', 'emphysema'] },
  { query: 'Asthma', aliases: ['asthma', 'wheezing', 'bronchial'] },
  { query: 'Pneumonia', aliases: ['pneumonia', 'lung infection', 'chest infection'] },
  { query: 'Gastritis', aliases: ['gastritis', 'stomach inflammation'] },
  { query: 'Peptic ulcer', aliases: ['peptic ulcer', 'ulcer', 'stomach ulcer'] },
  { query: 'Osteoarthritis', aliases: ['osteoarthritis', 'arthritis', 'joint pain'] },
  { query: 'Urinary tract infection', aliases: ['uti', 'urinary tract infection', 'bladder infection'] },
  { query: 'Fever', aliases: ['fever', 'pyrexia', 'high temperature'] },
  { query: 'Low back pain', aliases: ['low back pain', 'lumbago', 'back pain'] },
  { query: 'COVID-19', aliases: ['covid', 'coronavirus', 'covid-19', 'sars-cov-2'] },
];

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function authenticate(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'icdapi_access',
    }),
  });
  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'API-Version': 'v2',
    'Accept-Language': 'en',
  };
}

/** fetch with a few retries — the WHO host occasionally drops a connection. */
async function fetchRetry(url: string, init: any, attempts = 4): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (e: any) {
      lastErr = e;
      const cause = e?.cause?.code || e?.cause?.message || '';
      console.warn(`  … retry ${i + 1}/${attempts} (${e.message}${cause ? ` / ${cause}` : ''})`);
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function discoverRelease(token: string): Promise<string> {
  const res = await fetchRetry('https://id.who.int/icd/release/11/mms', { headers: headers(token) });
  if (!res.ok) throw new Error(`Release discovery failed: ${res.status}`);
  const data = (await res.json()) as any;
  // The multi-version root exposes the newest release under `latestRelease`,
  // e.g. "http://id.who.int/icd/release/11/2026-01/mms".
  const id: string = data.latestRelease || (Array.isArray(data.release) ? data.release[0] : '') || '';
  const m = String(id).match(/release\/11\/([^/]+)\/mms/);
  const release = m ? m[1] : null;
  if (!release) throw new Error(`Could not determine latest MMS release from ${JSON.stringify(id)}`);
  return release;
}

async function searchCode(
  token: string,
  release: string,
  query: string,
): Promise<{ code: string; title: string } | null> {
  const url =
    `https://id.who.int/icd/release/11/${release}/mms/search` +
    `?q=${encodeURIComponent(query)}&flatResults=true&highlightingEnabled=false&useFlexisearch=true`;
  const res = await fetchRetry(url, { method: 'POST', headers: headers(token) });
  if (!res.ok) {
    console.warn(`  ⚠️  search "${query}" -> HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as any;
  const ents: any[] = data.destinationEntities || [];
  // Pick the first result that carries a stem code.
  for (const e of ents) {
    const code = (e.theCode || '').trim();
    if (code) {
      return { code, title: stripHtml(e.title || '') };
    }
  }
  return null;
}

async function main() {
  const clientId = process.env.ICD11_CLIENT_ID;
  const clientSecret = process.env.ICD11_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('❌ Set ICD11_CLIENT_ID and ICD11_CLIENT_SECRET in the environment.');
    process.exit(1);
  }

  console.log('🔑 Authenticating with WHO ICD API...');
  const token = await authenticate(clientId, clientSecret);
  console.log('✅ Authenticated.');

  const release = await discoverRelease(token);
  console.log(`📚 Using MMS release: ${release}`);

  const results: { code: string; short_description: string; search_terms: string[] }[] = [];
  const misses: string[] = [];

  for (const c of CONDITIONS) {
    const hit = await searchCode(token, release, c.query);
    if (hit) {
      results.push({ code: hit.code, short_description: hit.title, search_terms: c.aliases });
      console.log(`  ✅ ${hit.code.padEnd(8)} ${hit.title}`);
    } else {
      misses.push(c.query);
      console.log(`  ❌ no code for "${c.query}"`);
    }
    await new Promise((r) => setTimeout(r, 150)); // be gentle on the API
  }

  const outPath = join(__dirname, '..', 'src', 'icd11', 'seeds', 'common-icd11-codes.seed.ts');
  const body =
    `// AUTO-GENERATED from the official WHO ICD-11 MMS API (release ${release}).\n` +
    `// Regenerate with: npx ts-node scripts/fetch-icd11-codes.ts\n` +
    `// Source: https://icd.who.int  —  codes and titles are authoritative WHO data.\n` +
    `export const COMMON_ICD11_CODES = [\n` +
    results
      .map(
        (r) =>
          `  { code: ${JSON.stringify(r.code)}, short_description: ${JSON.stringify(
            r.short_description,
          )}, search_terms: ${JSON.stringify(r.search_terms)} },`,
      )
      .join('\n') +
    `\n];\n`;

  writeFileSync(outPath, body, 'utf8');
  console.log(`\n📝 Wrote ${results.length} codes to ${outPath}`);
  if (misses.length) console.log(`⚠️  No match for: ${misses.join(', ')}`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
