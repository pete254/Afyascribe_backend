import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await client.connect();

  const res = await client.query('SELECT id, facility_id FROM patients LIMIT 1');
  if (res.rows.length === 0) {
    console.log('No patients found; create a patient first.');
    await client.end();
    return;
  }
  const patient = res.rows[0];
  const facilityId = patient.facility_id || (await client.query('SELECT id FROM facilities LIMIT 1')).rows[0]?.id;
  if (!facilityId) {
    console.log('No facility found; create a facility first.');
    await client.end();
    return;
  }

  const insert = await client.query(
    `INSERT INTO radiology (facility_id, patient_id, type, status, notes, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id`,
    [facilityId, patient.id, 'X-RAY' /* harmless default */, 'REQUESTED', 'Seeded radiology request'],
  );
  console.log('Inserted radiology id', insert.rows[0].id);
  await client.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
