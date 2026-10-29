#!/usr/bin/env node
/*
 * ServiceHub (SQLite) -> Nalog (PostgreSQL) importer.
 *
 *   node migrate-sqlite-to-postgres.js --db ../servicehub/backend/data/servicehub.db \
 *        --out import.sql [--labor-rate 2500.00] [--vat 0.2000] [--payment CASH]
 *   psql -v ON_ERROR_STOP=1 -d elgor_nalog -f import.sql
 *
 * SAFETY
 *  - Opens SQLite READ-ONLY. Never writes to it.
 *  - Only GENERATES a SQL file; you review it, then run it.
 *  - The whole file is ONE transaction (BEGIN..COMMIT): any error => nothing imported.
 *  - Re-runnable: legacy_id / legacy_job_id are UNIQUE + ON CONFLICT DO NOTHING.
 *  - RULE A: no money is calculated in JavaScript. Totals are computed inside
 *    Postgres with NUMERIC + round() (half away from zero == HALF_UP for >= 0).
 *  - Ends with an ASSERT that the expected number of jobs landed.
 *
 * NOT migrated: photos (files stay in the Node uploads dir), user accounts
 * (the Java service trusts the same JWTs; only id/name/role are copied), job priority. The user directory (id, name, role, active) IS copied so nalozi can be assigned.
 * Job notes are appended to the nalog diagnosis text so nothing is lost.
 */
'use strict';
const fs = require('fs');

// ---- args ----------------------------------------------------------------
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));
if (!args.db || !args.out) {
  console.error('usage: --db <servicehub.db> --out <import.sql> [--labor-rate 2500.00] [--vat 0.2000] [--payment CASH|CARD|INVOICE]');
  process.exit(1);
}
const LABOR_RATE = args['labor-rate'] ?? '2500.00';
const VAT = args.vat ?? '0.2000';
const PAYMENT = args.payment ?? 'CASH';
if (!/^\d+(\.\d{1,2})?$/.test(LABOR_RATE)) die('--labor-rate must look like 2500.00');
if (!/^0(\.\d{1,4})?$/.test(VAT)) die('--vat must look like 0.2000');
if (!['CASH', 'CARD', 'INVOICE'].includes(PAYMENT)) die('--payment must be CASH, CARD or INVOICE');

function die(m) { console.error('ERROR: ' + m); process.exit(1); }

// ---- read-only sqlite, better-sqlite3 first, node:sqlite as fallback -----------
function openDb(path) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path, { readonly: true, fileMustExist: true });
    return { all: (sql) => db.prepare(sql).all() };
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path, { readOnly: true });
    return { all: (sql) => db.prepare(sql).all() };
  }
}
const db = openDb(args.db);

// ---- helpers -------------------------------------------------------------
const q = (v) => (v === null || v === undefined || v === '') ? 'NULL'
  : "'" + String(v).replace(/\u0000/g, '').replace(/'/g, "''") + "'";
const qOr = (v, fallback) => q((v === null || v === undefined || String(v).trim() === '') ? fallback : String(v).trim());
const ts = (v) => v ? `'${String(v).replace(/'/g, '')}+00'::timestamptz` : 'NULL';   // SQLite datetime('now') is UTC
const hours = (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '0.00');
const trunc = (s, n) => (s == null ? s : String(s).slice(0, n));

const STATUS = { pending: 'DRAFT', assigned: 'DISPATCHED', in_progress: 'IN_PROGRESS', finished: 'COMPLETED', cancelled: 'CANCELLED' };

// free text (Serbian or English) -> enum
function applianceType(t) {
  const s = String(t || '').toLowerCase();
  const has = (...k) => k.some((x) => s.includes(x));
  if (has('klima', 'air cond', 'a/c', 'split')) return 'AIR_CONDITIONER';
  if (has('zamrziv', 'freezer', 'frizider sa zamrziv')) return 'FREEZER';
  if (has('frižider', 'frizider', 'fridge', 'refrigerator', 'hladnjak')) return 'REFRIGERATOR';
  if (has('veš', 'ves ma', 'washing', 'mašina za veš', 'masina za ves')) return 'WASHING_MACHINE';
  if (has('suš', 'sus', 'dryer')) return 'DRYER';
  if (has('sudove', 'sudova', 'dishwasher')) return 'DISHWASHER';
  if (has('rerna', 'oven', 'pećnica', 'pecnica')) return 'OVEN';
  if (has('šporet', 'sporet', 'stove', 'cooker')) return 'STOVE';
  if (has('bojler', 'boiler')) return 'BOILER';
  if (has('water heater', 'grejač', 'grejac')) return 'WATER_HEATER';
  return 'OTHER';
}

// ---- load ----------------------------------------------------------------
const cols = db.all('PRAGMA table_info(jobs)').map((c) => c.name);
const hoursCol = cols.includes('hours_logged') ? 'j.hours_logged' : '0';

const users = db.all('SELECT id, name, role, active FROM users ORDER BY id');
const customers = db.all('SELECT * FROM customers ORDER BY id');
const jobs = db.all(`
  SELECT j.id, j.customer_id, j.title, j.description, j.status, j.scheduled_at, j.finished_at,
         j.address AS job_address, j.created_at, j.updated_at, ${hoursCol} AS hours,
         j.created_by, j.assigned_to,
         cb.name AS created_by_name, au.name AS assigned_name,
         a.type AS a_type, a.brand AS a_brand, a.model AS a_model, a.serial_number AS a_serial
  FROM jobs j
  LEFT JOIN appliances a ON a.id = j.appliance_id
  LEFT JOIN users cb ON cb.id = j.created_by
  LEFT JOIN users au ON au.id = j.assigned_to
  ORDER BY j.id`);
const notes = db.all(`
  SELECT n.job_id, n.note, n.created_at, u.name AS author
  FROM job_notes n LEFT JOIN users u ON u.id = n.author_id
  ORDER BY n.job_id, n.created_at, n.id`);
const notesByJob = new Map();
for (const n of notes) {
  if (!notesByJob.has(n.job_id)) notesByJob.set(n.job_id, []);
  notesByJob.get(n.job_id).push(n);
}
const customerById = new Map(customers.map((c) => [c.id, c]));

// ---- emit ----------------------------------------------------------------
const out = [];
out.push('-- Generated by migrate-sqlite-to-postgres.js. Review, then: psql -v ON_ERROR_STOP=1 -f this.sql');
out.push(`-- customers: ${customers.length}  jobs: ${jobs.length}  labor-rate: ${LABOR_RATE}  vat: ${VAT}  payment: ${PAYMENT}`);
out.push('BEGIN;');

// User directory (names/roles only - passwords never leave the Node app).
for (const u of users) {
  out.push(`INSERT INTO app_user (id, name, role, active) VALUES (${u.id}, ${qOr(trunc(u.name, 150), 'unknown')}, ${q(u.role)}, ${u.active ? 'TRUE' : 'FALSE'})
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, active = EXCLUDED.active;`);
}

for (const c of customers) {
  out.push(
    'INSERT INTO customer (full_name, address, city, phone, email, location_notes, legacy_id, created_at, updated_at) VALUES (' +
    [qOr(trunc(c.name, 150), 'N/A'), qOr(trunc(c.address, 255), 'N/A'), 'NULL', qOr(trunc(c.phone, 40), '-'),
     q(trunc(c.email, 150)), q(trunc(c.notes, 500)), c.id, ts(c.created_at), ts(c.created_at)].join(', ') +
    ') ON CONFLICT (legacy_id) DO NOTHING;');
}

// Legacy jobs may have no customer (customer_id NULL, or the customer was deleted).
// They all point at one placeholder customer so nothing is lost; fix them by hand later.
const NO_CUSTOMER = -1;
let placeholderEmitted = false;

for (const j of jobs) {
  let custLegacyId = j.customer_id;
  if (custLegacyId == null || !customerById.get(custLegacyId)) {
    custLegacyId = NO_CUSTOMER;
    if (!placeholderEmitted) {
      placeholderEmitted = true;
      out.push(
        "INSERT INTO customer (full_name, address, city, phone, email, location_notes, legacy_id, created_at, updated_at) " +
        "VALUES ('Nepoznat klijent', 'N/A', NULL, '-', NULL, 'Uvezeno bez klijenta', " + NO_CUSTOMER + ", now(), now()) " +
        "ON CONFLICT (legacy_id) DO NOTHING;");
    }
  }

  let diagnosis = [j.title, j.description].filter(Boolean).join('\n');
  const jn = notesByJob.get(j.id);
  if (jn) {
    diagnosis += '\n\n--- Napomene (import iz ServiceHub) ---\n' +
      jn.map((n) => `[${n.created_at} ${n.author || '?'}] ${n.note}`).join('\n');
  }
  const status = STATUS[j.status];
  if (!status) die(`job ${j.id} has unknown status ${j.status}`);

  // Money: Postgres NUMERIC does the maths. Same formula as PricingCalculator.java.
  out.push(
`INSERT INTO nalog (
  nalog_number, customer_id, appliance_type, appliance_brand, appliance_model, serial_number, diagnosis,
  labor_hours, labor_rate, labor_total, parts_total, subtotal, vat_rate, vat_amount, total,
  payment_type, status, created_by_id, created_by_name, assigned_to_id, assigned_to_name, scheduled_at, completed_at, legacy_job_id, created_at, updated_at)
SELECT
  format('N-%s-%s', to_char(${ts(j.created_at)}, 'YYYY'), lpad(nextval('nalog_number_seq')::text, 6, '0')),
  c.id, ${q(applianceType(j.a_type))}, ${qOr(trunc(j.a_brand, 100), 'N/A')}, ${q(trunc(j.a_model, 100))}, ${q(trunc(j.a_serial, 100))}, ${q(diagnosis)},
  ${hours(j.hours)}, ${LABOR_RATE}, round(${hours(j.hours)}::numeric * ${LABOR_RATE}::numeric, 2), 0.00,
  round(${hours(j.hours)}::numeric * ${LABOR_RATE}::numeric, 2),
  ${VAT}, round(round(${hours(j.hours)}::numeric * ${LABOR_RATE}::numeric, 2) * ${VAT}::numeric, 2),
  round(${hours(j.hours)}::numeric * ${LABOR_RATE}::numeric, 2) + round(round(${hours(j.hours)}::numeric * ${LABOR_RATE}::numeric, 2) * ${VAT}::numeric, 2),
  ${q(PAYMENT)}, ${q(status)}, ${j.created_by ?? 'NULL'}, ${q(j.created_by_name)}, ${j.assigned_to ?? 'NULL'}, ${q(j.assigned_name)}, ${ts(j.scheduled_at)}, ${status === 'COMPLETED' ? ts(j.finished_at || j.updated_at) : 'NULL'},
  ${j.id}, ${ts(j.created_at)}, ${ts(j.updated_at)}
FROM customer c WHERE c.legacy_id = ${custLegacyId}
ON CONFLICT (legacy_job_id) DO NOTHING;`);

  out.push(
`INSERT INTO nalog_status_history (nalog_id, from_status, to_status, changed_by_id, changed_by_name, changed_at)
SELECT n.id, NULL, n.status, n.created_by_id, n.created_by_name, n.created_at FROM nalog n
WHERE n.legacy_job_id = ${j.id} AND NOT EXISTS (SELECT 1 FROM nalog_status_history h WHERE h.nalog_id = n.id);`);
}

// Fail the whole transaction if anything silently went missing.
const ids = jobs.map((j) => j.id).join(',');
out.push(`DO $$ DECLARE got integer; BEGIN
  SELECT count(*) INTO got FROM nalog WHERE legacy_job_id = ANY(ARRAY[${ids || '0'}]::bigint[]);
  ASSERT got = ${jobs.length}, format('expected ${jobs.length} imported jobs, found %s', got);
  ASSERT (SELECT count(*) FROM customer WHERE legacy_id IS NOT NULL) >= ${customers.length}, 'customer count mismatch';
END $$;`);
out.push('COMMIT;');

fs.writeFileSync(args.out, out.join('\n') + '\n');
console.log(`Wrote ${args.out}: ${customers.length} customers, ${jobs.length} jobs, ${notes.length} notes folded into diagnoses.`);
