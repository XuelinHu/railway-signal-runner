import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const BASELINE_VERSION = '001_initial_schema'
const MIGRATION_FILE_PATTERN = /^\d{3,}_[a-z0-9][a-z0-9_-]*\.sql$/

export async function applyMigrations(pool, { baselinePath, migrationsDir }) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const migrations = [
    { version: BASELINE_VERSION, path: baselinePath },
    ...(await listMigrationFiles(migrationsDir)),
  ]
  const applied = await pool.query('SELECT version, checksum FROM schema_migrations')
  const appliedByVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]))
  const newlyApplied = []

  for (const migration of migrations) {
    const sql = await readFile(migration.path, 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const existingChecksum = appliedByVersion.get(migration.version)

    if (existingChecksum) {
      if (existingChecksum !== checksum) {
        throw new Error(`Applied migration was modified: ${migration.version}`)
      }
      continue
    }

    if (await runMigration(pool, migration.version, checksum, sql)) {
      newlyApplied.push(migration.version)
    }
  }

  return { applied: newlyApplied }
}

async function listMigrationFiles(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()

  return names.map((name) => {
    if (!MIGRATION_FILE_PATTERN.test(name)) {
      throw new Error(`Invalid migration filename: ${name}`)
    }
    return { version: basename(name, '.sql'), path: resolve(directory, name) }
  })
}

async function runMigration(pool, version, checksum, sql) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('railway-signal-runner:migrations'))")
    const existing = await client.query(
      'SELECT checksum FROM schema_migrations WHERE version = $1',
      [version]
    )
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration was modified: ${version}`)
      }
      await client.query('COMMIT')
      return false
    }
    await client.query(sql)
    await client.query(
      'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
      [version, checksum]
    )
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
