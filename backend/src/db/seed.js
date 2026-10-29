// Run with: node src/db/seed.js
// Creates a default admin so you can actually log in on first boot.
const bcrypt = require('bcryptjs');
const db = require('./index');

const email = process.argv[2] || 'admin@servicehub.local';
const password = process.argv[3] || 'admin123';
const name = process.argv[4] || 'Admin';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
    console.log(`User ${email} already exists (id ${existing.id}). Not creating a duplicate.`);
    process.exit(0);
}

const hash = bcrypt.hashSync(password, 10);
const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
).run(name, email, hash, 'admin');

console.log(`Created admin user:
  id: ${info.lastInsertRowid}
  email: ${email}
  password: ${password}
  (change this password after first login - this is a seed script, not a security feature)`);
