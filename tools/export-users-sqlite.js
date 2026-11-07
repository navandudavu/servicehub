#!/usr/bin/env node
/*
 * ONE-TIME export of the accounts from the old Node/SQLite database into SQL for the Java service.
 *
 *   deploy/migrate-users-from-node.sh          (runs this inside the still-running old node container)
 *   node tools/export-users-sqlite.js path/to/servicehub.db > users-export.sql     (or directly on a copy)
 *
 * Opens SQLite READ-ONLY, prints SQL only. The output contains password hashes: keep it private, delete it after the import.
 * Ids are kept, so nalozi that are assigned to a technician stay assigned to the same person.
 */
'use strict';

const dbPath = process.argv[2] || process.env.DB_PATH;
if (!dbPath) {
  console.error('Usage: node export-users-sqlite.js <servicehub.db>   (or set DB_PATH)');
  process.exit(1);
}

function openReadOnly(p) {
  try {
    const Database = require('better-sqlite3');
    return new Database(p, { readonly: true, fileMustExist: true });
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(p, { readOnly: true });
  }
}

const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const db = openReadOnly(dbPath);
const all = db.prepare('SELECT id, name, email, password_hash, role, phone, active FROM users ORDER BY id').all();
const users = all.filter((u) => {
  const ok = (u.role === 'admin' || u.role === 'technician') && u.email && u.password_hash;
  if (!ok) console.error(`skipped user ${u.id} (${u.email}): role/email/password missing or unknown role`);
  return ok;
});
if (users.length === 0) {
  console.error('No usable users found - nothing to export.');
  process.exit(1);
}

const out = [];
out.push('-- Accounts from the old Node backend. Run ONCE, after the Java service has started (it creates the tables).');
out.push('BEGIN;');
// the first-start admin the Java service created would clash on the e-mail address
out.push(`DELETE FROM app_user WHERE lower(email) IN (${users.map((u) => q(u.email.toLowerCase())).join(', ')}) `
       + `AND id NOT IN (${users.map((u) => Number(u.id)).join(', ')});`);
for (const u of users) {
  out.push(
    'INSERT INTO app_user (id, name, email, password_hash, role, phone, active, last_seen_at) VALUES '
    + `(${Number(u.id)}, ${q(u.name)}, ${q(u.email)}, ${q(u.password_hash)}, ${q(u.role)}, ${q(u.phone)}, ${u.active ? 'TRUE' : 'FALSE'}, now()) `
    + 'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, '
    + 'role = EXCLUDED.role, phone = EXCLUDED.phone, active = EXCLUDED.active;');
}
out.push("SELECT setval('app_user_id_seq', (SELECT COALESCE(MAX(id), 0) FROM app_user) + 1, false);");
out.push('COMMIT;');
console.log(out.join('\n'));
console.error(`exported ${users.length} user(s)`);
