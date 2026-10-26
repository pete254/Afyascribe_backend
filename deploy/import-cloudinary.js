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
// Once a file is stored here and its row updated, the readable copy on
// Cloudinary is deleted (with the CLOUDINARY_* settings still in .env), so the
// account is left holding only the encrypted backups made by
// deploy/offsite-uploads.sh. Any copy that could not be deleted is listed.

const { createHash } = require('crypto');
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

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;

/** Delete the readable copy. PDFs were uploaded as `raw`, images as `image`. */
async function destroy(publicId, resourceType) {
  if (!publicId) return;
  if (!CLOUD || !API_KEY || !SECRET)
    throw new Error('CLOUDINARY_* not set — delete it by hand');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${SECRET}`)
    .digest('hex');
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/destroy`,
    {
      method: 'POST',
      body: new URLSearchParams({
        public_id: publicId,
        timestamp,
        api_key: API_KEY,
        signature,
      }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !['ok', 'not found'].includes(body.result)) {
    throw new Error(`Cloudinary said ${res.status} ${JSON.stringify(body)}`);
  }
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
  const leftOnCloudinary = [];
  const removeOriginal = async (publicId, resourceType) => {
    try {
      await destroy(publicId, resourceType);
    } catch (e) {
      leftOnCloudinary.push(`${publicId}: ${e.message}`);
    }
  };

  for (const [table, kind] of [
    ['patient_documents', 'patients'],
    ['employee_documents', 'staff'],
  ]) {
    const { rows } = await db.query(
      `select id, facility_id, file_url, file_type, public_id from ${table}
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
        await removeOriginal(
          r.public_id,
          r.file_type === 'application/pdf' ? 'raw' : 'image',
        );
      } catch (e) {
        failed.push(`${table} ${r.id}: ${e.message}`);
      }
    }
  }

  const { rows: logos } = await db.query(
    `select id, logo_url, logo_public_id from facilities where logo_key is null and logo_url like 'https://res.cloudinary.com/%'`,
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
        await removeOriginal(f.logo_public_id, 'image');
      } catch (e) {
        failed.push(`facility ${f.id} logo: ${e.message}`);
      }
    }
  }

  await db.end();
  if (DRY) return console.log('dry run — nothing changed');
  console.log(`moved ${moved}; failed ${failed.length}`);
  failed.forEach((f) => console.log(`  FAILED ${f}`));
  if (leftOnCloudinary.length) {
    console.log(
      `  ${leftOnCloudinary.length} readable copy(ies) still on Cloudinary — delete by hand:`,
    );
    leftOnCloudinary.forEach((l) => console.log(`  LEFT ${l}`));
  }
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
