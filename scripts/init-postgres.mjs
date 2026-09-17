import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const here = dirname(fileURLToPath(import.meta.url))
const schemaFile = resolve(here, '../server/src/db/schema.sql')

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

// schema.sql 全部语句幂等，可重复执行；已有的 training_scenes / training_records 走 ALTER 原地扩展。
const schema = await readFile(schemaFile, 'utf8')
await app.query(schema)
console.log(`applied schema from ${schemaFile}`)

const { rows } = await app.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`)
console.log(`tables in ${targetDatabase}: ${rows.map((row) => row.table_name).join(', ')}`)

await app.end()
console.log(`initialized schema in ${targetDatabase}`)

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}
