import pg from 'pg'
import { config } from '../config.js'

const { Pool } = pg

// pg 默认把 int8(bigint) 和 numeric 解析成字符串以免精度丢失。
// 本项目的 COUNT(*) OVER() 和自增主键都远小于 2^53，转成数字后前端才好用。
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value))

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  statement_timeout: config.db.statementTimeout,
})

pool.on('error', (error) => {
  console.error('[db] 空闲连接异常：', error.message)
})

const SLOW_QUERY_MS = 500

export async function query(text, params = []) {
  const startedAt = Date.now()
  try {
    return await pool.query(text, params)
  } finally {
    const elapsed = Date.now() - startedAt
    if (elapsed > SLOW_QUERY_MS) {
      console.warn(`[db] 慢查询 ${elapsed}ms：${text.replace(/\s+/g, ' ').slice(0, 160)}`)
    }
  }
}

/** 取一行，没有则返回 null。 */
export async function queryOne(text, params = []) {
  const { rows } = await query(text, params)
  return rows[0] ?? null
}

/** 在单个连接上跑事务；回调抛错则回滚。 */
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('[db] 回滚失败：', rollbackError.message)
    }
    throw error
  } finally {
    client.release()
  }
}

export async function healthCheck() {
  try {
    const row = await queryOne('SELECT now() AS now, current_database() AS database')
    return { ok: true, database: row.database, now: row.now }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

export async function closePool() {
  await pool.end()
}
