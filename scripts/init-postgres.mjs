import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { applyMigrations } from '../server/src/db/migrations.js'

const { Pool } = pg

const here = dirname(fileURLToPath(import.meta.url))
const schemaFile = resolve(here, '../server/src/db/schema.sql')
const migrationsDir = resolve(here, '../server/src/db/migrations')

const config = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'railway_signal_runner_app',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'railway_signal_runner'
}

if (!config.password) {
  throw new Error('Missing PGPASSWORD environment variable')
}

const app = new Pool(config)

const migrationResult = await applyMigrations(app, {
  baselinePath: schemaFile,
  migrationsDir,
})
console.log(`applied migrations: ${migrationResult.applied.join(', ')}`)

const { rows } = await app.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`)
  console.log(`tables in ${config.database}: ${rows.map((row) => row.table_name).join(', ')}`)

await app.end()
console.log(`initialized schema in ${config.database}`)
