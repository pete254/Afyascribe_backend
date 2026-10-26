// Move every uploaded file still on Cloudinary onto this server, once.
//
//   sudo docker compose exec -T -e DRY=1 backend node - < deploy/import-cloudinary.js   # count only
//   sudo docker compose exec -T backend node - < deploy/import-cloudinary.js            # move
//
// Runs inside the backend container, so files are stored with the
// application's own code (dist/files/file-store.js) — same checks, same
// layout, same permissions — into the `uploads` volume.
//
// For each patient document, employee document and facility logo whose file is
// still a Cloudinary address: download it, check its content is the type it
// claims, store it, and point the row at the stored copy (the Cloudinary
// address and id are cleared). A file that fails is reported and left as it
// was; run again to retry. Safe to re-run: moved rows are skipped.
//
// Once it reports nothing left, the Cloudinary account can be closed.

const { Client } = require('pg');
const {
  storeFile,
  verifiedType,
  DEFAULT_UPLOADS_DIR,
} = require('/app/dist/files/file-store');
const { publicApiUrl } = require('/app/dist/files/files.service');

const ROOT = process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;
const DRY = process.env.DRY === '1';
const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await db.connect();
  let moved = 0;
  const failed = [];

  for (const [table, kind] of [
    ['patient_documents', 'patients'],
    ['employee_documents', 'staff'],
  ]) {
    const { rows } = await db.query(
      `select id, facility_id, file_url, file_type from ${table}
        where storage_key is null and file_url is not null order by created_at`,
    );
    console.log(`${table}: ${rows.length} to move`);
    if (DRY) continue;
    for (const r of rows) {
      try {
        const buf = await download(r.file_url);
        const mime = verifiedType(buf, r.file_type, DOC_TYPES);
        const key = await storeFile(ROOT, kind, r.facility_id, buf, mime);
        await db.query(
          `update ${table} set storage_key = $1, file_type = $2, file_url = null, public_id = null where id = $3`,
          [key, mime, r.id],
        );
        moved++;
      } catch (e) {
        failed.push(`${table} ${r.id}: ${e.message}`);
      }
    }
  }

  const { rows: logos } = await db.query(
    `select id, logo_url from facilities where logo_key is null and logo_url like 'https://res.cloudinary.com/%'`,
  );
  console.log(`facility logos: ${logos.length} to move`);
  if (!DRY) {
    const base = publicApiUrl(process.env);
    for (const f of logos) {
      try {
        const buf = await download(f.logo_url);
        const type =
          buf[0] === 0x89
            ? 'image/png'
            : buf[0] === 0xff
              ? 'image/jpeg'
              : 'image/webp';
        const mime = verifiedType(buf, type, LOGO_TYPES);
        const key = await storeFile(ROOT, 'logos', f.id, buf, mime);
        await db.query(
          `update facilities set logo_key = $1, logo_url = $2, logo_public_id = null where id = $3`,
          [key, `${base}/files/logo/${f.id}?v=${Date.now()}`, f.id],
        );
        moved++;
      } catch (e) {
        failed.push(`facility ${f.id} logo: ${e.message}`);
      }
    }
  }

  await db.end();
  if (DRY) return console.log('dry run — nothing changed');
  console.log(`moved ${moved}; failed ${failed.length}`);
  failed.forEach((f) => console.log(`  FAILED ${f}`));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
