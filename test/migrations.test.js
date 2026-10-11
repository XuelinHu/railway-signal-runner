import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { applyMigrations } from '../server/src/db/migrations.js'

class FakePool {
  applied = new Map()
  statements = []
  releases = 0

  async query(sql) {
    if (sql.includes('SELECT version, checksum')) {
      return { rows: [...this.applied].map(([version, checksum]) => ({ version, checksum })) }
    }
    return { rows: [] }
  }

  async connect() {
    const staged = []
    return {
      query: async (sql, params = []) => {
        if (sql === 'BEGIN') return
        if (sql.startsWith('SELECT pg_advisory_xact_lock')) return
        if (sql.includes('SELECT checksum FROM schema_migrations')) {
          const checksum = this.applied.get(params[0])
          return { rows: checksum ? [{ checksum }] : [] }
        }
        if (sql === 'COMMIT') {
          for (const [version, checksum] of staged) this.applied.set(version, checksum)
          return
        }
        if (sql === 'ROLLBACK') {
          staged.length = 0
          return
        }
        if (sql.startsWith('INSERT INTO schema_migrations')) {
          staged.push(params)
          return
        }
        if (sql.includes('FAIL_MIGRATION')) throw new Error('migration failed')
        this.statements.push(sql)
      },
      release: () => { this.releases += 1 },
    }
  }
}

async function setup(t, migrationFiles = {}) {
  const root = await mkdtemp(join(tmpdir(), 'railway-migrations-'))
  const migrationsDir = join(root, 'migrations')
  await mkdir(migrationsDir)
  const baselinePath = join(root, 'schema.sql')
  await writeFile(baselinePath, 'CREATE TABLE baseline;')
  for (const [name, sql] of Object.entries(migrationFiles)) {
    await writeFile(join(migrationsDir, name), sql)
  }
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, baselinePath, migrationsDir }
}

test('applies the baseline and numbered migrations in order, then skips them', async (t) => {
  const files = await setup(t, {
    '003_last.sql': 'SELECT 3;',
    '002_second.sql': 'SELECT 2;',
  })
  const pool = new FakePool()

  const first = await applyMigrations(pool, files)
  const second = await applyMigrations(pool, files)

  assert.deepEqual(first.applied, ['001_initial_schema', '002_second', '003_last'])
  assert.deepEqual(second.applied, [])
  assert.deepEqual(pool.statements, ['CREATE TABLE baseline;', 'SELECT 2;', 'SELECT 3;'])
  assert.equal(pool.applied.size, 3)
  assert.equal(pool.releases, 3)
})

test('rejects edits to a migration already recorded in the ledger', async (t) => {
  const files = await setup(t, { '002_second.sql': 'SELECT 2;' })
  const pool = new FakePool()
  await applyMigrations(pool, files)
  await writeFile(join(files.migrationsDir, '002_second.sql'), 'SELECT 22;')

  await assert.rejects(applyMigrations(pool, files), /Applied migration was modified: 002_second/)
})

test('rolls back and leaves a failed migration unapplied', async (t) => {
  const files = await setup(t, { '002_broken.sql': 'FAIL_MIGRATION' })
  const pool = new FakePool()

  await assert.rejects(applyMigrations(pool, files), /migration failed/)
  assert.deepEqual([...pool.applied.keys()], ['001_initial_schema'])
  assert.equal(pool.releases, 2)
})

test('rejects migration filenames without an ordered version', async (t) => {
  const files = await setup(t, { 'add_column.sql': 'SELECT 1;' })
  await assert.rejects(applyMigrations(new FakePool(), files), /Invalid migration filename/)
})
