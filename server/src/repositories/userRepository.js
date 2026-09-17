import { query, queryOne } from '../db/pool.js'
import { newId } from '../utils/id.js'

// 显式列出字段：password_hash 绝不能出现在任何 SELECT * 里。
const PUBLIC_COLUMNS = `
  id, username, display_name, email, phone, role, status,
  must_change_password, failed_login_count, locked_until,
  last_login_at, last_login_ip, password_changed_at, remark,
  created_at, updated_at, deleted_at
`

export function findById(id) {
  return queryOne(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id])
}

/** 登录用：需要带出 password_hash 做校验。 */
export function findByUsernameWithSecret(username) {
  return queryOne(
    `SELECT ${PUBLIC_COLUMNS}, password_hash
     FROM users
     WHERE lower(username) = lower($1) AND deleted_at IS NULL`,
    [username]
  )
}

/** 忘记密码用：用户名 / 邮箱 / 手机号三选一都能定位账号。 */
export function findByAccountWithSecret(account) {
  return queryOne(
    `SELECT ${PUBLIC_COLUMNS}, password_hash
     FROM users
     WHERE deleted_at IS NULL
       AND (lower(username) = lower($1) OR lower(email) = lower($1) OR phone = $1)
     LIMIT 1`,
    [account]
  )
}

export async function insertUser(input) {
  const id = input.id ?? newId('u')
  return queryOne(
    `INSERT INTO users (id, username, display_name, email, phone, password_hash, role, status, remark, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      id,
      input.username,
      input.displayName ?? input.username,
      input.email ?? null,
      input.phone ?? null,
      input.passwordHash,
      input.role ?? 'student',
      input.status ?? 'active',
      input.remark ?? null,
      input.mustChangePassword ?? false,
    ]
  )
}

export async function updateUser(id, patch) {
  const sets = []
  const params = []
  const assign = (column, value) => {
    params.push(value)
    sets.push(`${column} = $${params.length}`)
  }

  if (patch.displayName !== undefined) assign('display_name', patch.displayName)
  if (patch.email !== undefined) assign('email', patch.email)
  if (patch.phone !== undefined) assign('phone', patch.phone)
  if (patch.role !== undefined) assign('role', patch.role)
  if (patch.status !== undefined) assign('status', patch.status)
  if (patch.remark !== undefined) assign('remark', patch.remark)
  if (patch.mustChangePassword !== undefined) assign('must_change_password', patch.mustChangePassword)
  if (patch.passwordHash !== undefined) {
    assign('password_hash', patch.passwordHash)
    sets.push('password_changed_at = now()')
    // 改密后旧令牌必须失效，否则被盗号后改密码也踢不掉攻击者。
    sets.push('failed_login_count = 0')
    sets.push('locked_until = NULL')
  }

  if (sets.length === 0) return findById(id)

  params.push(id)
  return queryOne(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} AND deleted_at IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    params
  )
}

export async function softDeleteUser(id) {
  const row = await queryOne(
    `UPDATE users SET deleted_at = now(), status = 'disabled'
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${PUBLIC_COLUMNS}`,
    [id]
  )
  return row
}

export async function recordLoginSuccess(id, ip) {
  await query(
    `UPDATE users
     SET last_login_at = now(), last_login_ip = $2, failed_login_count = 0, locked_until = NULL
     WHERE id = $1`,
    [id, ip ?? null]
  )
}

/**
 * 登录失败计数。达到阈值时把状态置为 locked 并写入解锁时间。
 * @returns {{ failedLoginCount: number, lockedUntil: Date|null }}
 */
export async function recordLoginFailure(id, maxFailed, lockMinutes) {
  // 用单条 SQL 完成 "自增 + 判断阈值 + 加锁"，避免读改写之间的竞态。
  const row = await queryOne(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1,
         locked_until = CASE
           WHEN failed_login_count + 1 >= $2 THEN now() + ($3 || ' minutes')::interval
           ELSE locked_until
         END,
         status = CASE
           WHEN failed_login_count + 1 >= $2 AND status = 'active' THEN 'locked'
           ELSE status
         END
     WHERE id = $1
     RETURNING failed_login_count, locked_until, status`,
    [id, maxFailed, String(lockMinutes)]
  )
  return row ?? { failedLoginCount: 0, lockedUntil: null, status: 'active' }
}

export async function unlockUser(id) {
  return queryOne(
    `UPDATE users SET status = 'active', failed_login_count = 0, locked_until = NULL
     WHERE id = $1 AND deleted_at IS NULL AND status = 'locked'
     RETURNING ${PUBLIC_COLUMNS}`,
    [id]
  )
}

export async function usernameExists(username, excludeId = null) {
  const row = await queryOne(
    `SELECT 1 AS hit FROM users
     WHERE lower(username) = lower($1) AND deleted_at IS NULL
       AND ($2::text IS NULL OR id <> $2)`,
    [username, excludeId]
  )
  return Boolean(row)
}

export async function emailExists(email, excludeId = null) {
  if (!email) return false
  const row = await queryOne(
    `SELECT 1 AS hit FROM users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL
       AND ($2::text IS NULL OR id <> $2)`,
    [email, excludeId]
  )
  return Boolean(row)
}

export async function phoneExists(phone, excludeId = null) {
  if (!phone) return false
  const row = await queryOne(
    `SELECT 1 AS hit FROM users
     WHERE phone = $1 AND deleted_at IS NULL
       AND ($2::text IS NULL OR id <> $2)`,
    [phone, excludeId]
  )
  return Boolean(row)
}

/**
 * 管理台用户列表（分页）。
 * COUNT(*) OVER()::int 让数据与总数一次往返拿到；::int 是因为 pg 会把 bigint 返回成字符串。
 * 排序用 id 作稳定 tiebreaker，避免 created_at 相同时 OFFSET 翻页出现重复或丢行。
 */
export async function listUsers({ q, role, status, limit, offset, sortColumn, sortDirection }) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name, u.email, u.phone, u.role, u.status,
            u.must_change_password, u.failed_login_count, u.locked_until,
            u.last_login_at, u.last_login_ip, u.created_at, u.updated_at,
            COUNT(*) OVER()::int AS total_count
     FROM users u
     WHERE u.deleted_at IS NULL
       AND ($1::text IS NULL OR u.username ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%'
            OR u.email ILIKE '%' || $1 || '%' OR u.phone ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR u.role = $2)
       AND ($3::text IS NULL OR u.status = $3)
     ORDER BY ${sortColumn} ${sortDirection}, u.id DESC
     LIMIT $4 OFFSET $5`,
    [q || null, role || null, status || null, limit, offset]
  )
  return rows
}

export async function countByRole() {
  const { rows } = await query(
    `SELECT role, COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL GROUP BY role`
  )
  return rows
}

export async function countAll() {
  const row = await queryOne(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'active')::int   AS active,
       COUNT(*) FILTER (WHERE status = 'locked')::int   AS locked,
       COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled
     FROM users WHERE deleted_at IS NULL`
  )
  return row
}
