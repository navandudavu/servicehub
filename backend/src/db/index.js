const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 1. Detect if the app is running inside a compiled pkg binary
const isPkg = typeof process.pkg !== 'undefined';

// 2. Safely resolve paths. 
// If compiled, use the directory where the actual .exe sits. Otherwise, use standard __dirname.
const rootDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '../../');

// 3. Fall back to environment variable or create the 'data/servicehub.db' right next to the app
const DB_PATH = process.env.DB_PATH || path.join(rootDir, 'data/servicehub.db');

// Make sure the data directory exists on the user's real file system
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// 4. Initialize Database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 5. Read the schema.sql safely from inside the virtual snapshot binary
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Lightweight migrations for columns added after someone may already have a
// database file on disk.
function columnExists(table, column) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some((c) => c.name === column);
}

if (!columnExists('jobs', 'hours_logged')) {
    db.exec('ALTER TABLE jobs ADD COLUMN hours_logged REAL');
}

if (!columnExists('job_photos', 'category')) {
    db.exec("ALTER TABLE job_photos ADD COLUMN category TEXT DEFAULT 'other'");
}

// Migration: make customer_id nullable in jobs table if it was created as NOT NULL
const jobsCols = db.prepare("PRAGMA table_info(jobs)").all();
const customerIdCol = jobsCols.find((c) => c.name === 'customer_id');
if (customerIdCol && customerIdCol.notnull === 1) {
    db.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN TRANSACTION;
        CREATE TABLE jobs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
            appliance_id INTEGER REFERENCES appliances(id) ON DELETE SET NULL,
            assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'assigned', 'in_progress', 'finished', 'cancelled')),
            priority TEXT NOT NULL DEFAULT 'normal'
                CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
            scheduled_at TEXT,
            finished_at TEXT,
            address TEXT,
            hours_logged REAL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO jobs_new SELECT * FROM jobs;
        DROP TABLE jobs;
        ALTER TABLE jobs_new RENAME TO jobs;
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_assigned ON jobs(assigned_to);
        COMMIT;
        PRAGMA foreign_keys = ON;
    `);
}

db.exec(`
    CREATE TABLE IF NOT EXISTS user_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        platform TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
`);

module.exports = db;