import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { applyMigrations } from '../server/src/db/migrations.js'

const { Pool } = pg
const here = dirname(fileURLToPath(import.meta.url))
const config = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'railway_signal_runner_app',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'railway_signal_runner',
}

if (!config.password) throw new Error('Missing PGPASSWORD environment variable')

const pool = new Pool(config)
try {
  const result = await applyMigrations(pool, {
    baselinePath: resolve(here, '../server/src/db/schema.sql'),
    migrationsDir: resolve(here, '../server/src/db/migrations'),
  })
  console.log(`Applied schema migrations: ${result.applied.join(', ') || 'none'}`)
} finally {
  await pool.end()
}
