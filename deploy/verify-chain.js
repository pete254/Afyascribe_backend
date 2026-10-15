// Verify the audit chain of a database directly, outside the running API.
//
// Used by deploy/restore-test.sh to prove a restored backup is not just
// present but unaltered. It runs inside the backend image, so it checks with
// the application's own compiled code (dist/audit/chain.js) — the same code
// behind "Verify the ledger" in the web app. A second implementation here
// could pass where the real one fails.
//
// Connection comes from the standard PGHOST/PGUSER/PGPASSWORD/PGDATABASE
// variables. Prints one JSON verdict; exits 0 only if the chain verifies.
//
// Must run in UTC, as the backend does: timestamps are stored without a zone
// and the hashes cover them (see docker-compose.yml).

const { Client } = require('pg');
const { verifyChain } = require('/app/dist/audit/chain');

const BATCH = 5000;

async function main() {
  const db = new Client();
  await db.connect();

  // Mirrors AuditService.verify: keyset batches from seq 1, each batch
  // required to link to the one before.
  const breaks = [];
  let checked = 0;
  let from = null;
  let to = null;
  let carried = null;
  let cursor = 1;

  for (;;) {
    const { rows } = await db.query(
      `select seq, facility_id, actor_id, actor_role, method, path, action,
              entity_type, entity_id, patient_id, category, status_code,
              created_at, hash, prev_hash
         from audit_events where seq >= $1 order by seq limit $2`,
      [cursor, BATCH],
    );
    if (!rows.length) break;

    const mapped = rows.map((r) => ({
      seq: Number(r.seq),
      facilityId: r.facility_id,
      actorId: r.actor_id,
      actorRole: r.actor_role,
      method: r.method,
      path: r.path,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      patientId: r.patient_id,
      category: r.category,
      statusCode: r.status_code,
      createdAt: r.created_at,
      hash: r.hash,
      prevHash: r.prev_hash,
    }));

    if (carried && mapped[0].prevHash !== carried.hash) {
      breaks.push({ seq: mapped[0].seq, reason: 'link-broken', detail: `Does not follow line ${carried.seq}` });
    }
    const verdict = verifyChain(mapped, carried ? undefined : 1);
    breaks.push(...verdict.breaks);
    checked += verdict.checked;
    if (from == null) from = verdict.from;
    to = verdict.to;

    const tail = mapped[mapped.length - 1];
    carried = { seq: tail.seq, hash: tail.hash };
    cursor = tail.seq + 1;
    if (rows.length < BATCH) break;
  }

  const unchained = Number((await db.query('select count(*) from audit_events where seq is null')).rows[0].count);
  await db.end();

  const ok = breaks.length === 0;
  // The first breaks are enough to locate a problem; all of them could be
  // every line after an early edit.
  console.log(JSON.stringify({ ok, checked, from, to, unchained, breaks: breaks.length, firstBreaks: breaks.slice(0, 5) }));
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`verify-chain: ${err.message}`);
  process.exit(2);
});
