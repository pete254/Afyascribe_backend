/**
 * Crawl the entire ICD-11 MMS linearization from the official WHO ICD API and
 * write every code + title to a JSON data file.
 *
 * Usage:
 *   ICD11_CLIENT_ID=... ICD11_CLIENT_SECRET=... node scripts/fetch-all-icd11.js
 */
const fs = require('fs');
const path = require('path');

const RELEASE = process.env.ICD11_RELEASE || '2026-01';
const CONCURRENCY = 16;
const OUT = path.join(__dirname, '..', 'src', 'icd11', 'data', 'icd11-mms.json');
const CKPT = path.join(__dirname, '..', 'src', 'icd11', 'data', 'icd11-mms.checkpoint.json');

let token = null;

async function authenticate() {
  const res = await fetch('https://icdaccessmanagement.who.int/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.ICD11_CLIENT_ID,
      client_secret: process.env.ICD11_CLIENT_SECRET,
      scope: 'icdapi_access',
    }),
  });
  if (!res.ok) throw new Error('Auth failed: ' + res.status);
  token = (await res.json()).access_token;
}

function headers() {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json',
    'API-Version': 'v2',
    'Accept-Language': 'en',
  };
}

const val = (x) => (x && typeof x === 'object' ? x['@value'] : x) || '';
const stripHtml = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function getEntity(url, attempt = 0) {
  // WHO returns http:// URIs; this environment only permits https (443).
  url = String(url).replace(/^http:\/\//, 'https://');
  try {
    const res = await fetch(url, { headers: headers() });
    if (res.status === 401 && attempt < 3) {
      await authenticate();
      return getEntity(url, attempt + 1);
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 5) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return getEntity(url, attempt + 1);
      }
    }
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      return getEntity(url, attempt + 1);
    }
    return null;
  }
}

// ── crawl state (module-level so the signal handler can checkpoint it) ──
let codes = new Map(); // code -> {code, short_description, chapter_code}
let visited = new Set();
let queue = [];

function saveCheckpoint() {
  fs.mkdirSync(path.dirname(CKPT), { recursive: true });
  fs.writeFileSync(
    CKPT,
    JSON.stringify({ visited: Array.from(visited), queue, codes: Array.from(codes.values()) }),
  );
}

let terminating = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    terminating = true;
    try {
      saveCheckpoint();
      console.log(`\n💾 ${sig}: checkpoint saved — visited ${visited.size}, codes ${codes.size}, queue ${queue.length}. Re-run to resume.`);
    } catch (e) {
      console.error('checkpoint save failed:', e.message);
    }
    process.exit(0);
  });
}

async function main() {
  console.log('🔑 Authenticating...');
  await authenticate();

  if (fs.existsSync(CKPT)) {
    const ck = JSON.parse(fs.readFileSync(CKPT, 'utf8'));
    visited = new Set(ck.visited);
    queue = ck.queue;
    codes = new Map(ck.codes.map((c) => [c.code, c]));
    console.log(`♻️  Resuming from checkpoint — visited ${visited.size}, codes ${codes.size}, queue ${queue.length}`);
  } else {
    const rootUrl = `https://id.who.int/icd/release/11/${RELEASE}/mms`;
    const root = await getEntity(rootUrl);
    if (!root || !Array.isArray(root.child)) throw new Error('No chapters found at root');
    console.log(`📚 Release ${RELEASE}: ${root.child.length} chapters`);
    queue = root.child.map((u) => ({ url: u, chapter: null }));
  }

  let processed = 0;

  while (queue.length && !terminating) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (item) => {
        if (visited.has(item.url)) return null;
        visited.add(item.url);
        const e = await getEntity(item.url);
        return e ? { e, item } : null;
      }),
    );
    const next = [];
    for (const r of results) {
      if (!r) continue;
      const { e, item } = r;
      processed++;
      // A chapter carries its own chapter number in `code` sometimes; otherwise
      // propagate the ancestor chapter code we already have.
      let chapter = item.chapter;
      if (e.classKind === 'chapter') chapter = (e.code || '').trim() || chapter;
      const code = (e.code || '').trim();
      if (code && !codes.has(code)) {
        codes.set(code, {
          code,
          short_description: stripHtml(val(e.title)),
          chapter_code: chapter || null,
        });
      }
      if (Array.isArray(e.child)) {
        for (const c of e.child) if (!visited.has(c)) next.push({ url: c, chapter });
      }
    }
    queue = next.concat(queue);
    if (processed % 500 < CONCURRENCY) {
      console.log(`  … visited ${visited.size}, codes ${codes.size}, queue ${queue.length}`);
    }
    if (processed % 2000 < CONCURRENCY) saveCheckpoint();
  }

  if (terminating) return; // signal handler already checkpointed & exited

  const arr = Array.from(codes.values()).sort((a, b) => a.code.localeCompare(b.code));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ release: RELEASE, count: arr.length, codes: arr }));
  if (fs.existsSync(CKPT)) fs.unlinkSync(CKPT);
  console.log(`\n✅ Wrote ${arr.length} codes to ${OUT} (checkpoint cleared)`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
