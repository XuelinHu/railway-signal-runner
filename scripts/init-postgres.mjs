import pg from 'pg'

const { Client } = pg

const config = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'deipss',
  password: process.env.PGPASSWORD,
  database: 'postgres'
}

const targetDatabase = process.env.PGDATABASE || 'railway_signal_runner'

if (!config.password) {
  throw new Error('Missing PGPASSWORD environment variable')
}

const admin = new Client(config)
await admin.connect()

const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDatabase])
if (exists.rowCount === 0) {
  await admin.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)} WITH ENCODING 'UTF8'`)
  console.log(`created database ${targetDatabase}`)
} else {
  console.log(`database ${targetDatabase} already exists`)
}

await admin.end()

const app = new Client({ ...config, database: targetDatabase })
await app.connect()

await app.query(`
  CREATE TABLE IF NOT EXISTS training_scenes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS training_records (
    id TEXT PRIMARY KEY,
    scene_id TEXT REFERENCES training_scenes(id) ON DELETE SET NULL,
    student_name TEXT,
    score INTEGER,
    elapsed_seconds INTEGER,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`)

await app.end()
console.log(`initialized schema in ${targetDatabase}`)

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}
