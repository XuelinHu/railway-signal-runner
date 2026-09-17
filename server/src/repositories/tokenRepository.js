import { query, queryOne } from '../db/pool.js'
import { newId } from '../utils/id.js'
import { sha256 } from '../services/passwordService.js'

export async function insertResetToken({ userId, rawToken, expiresAt, channel, issuedBy, ip }) {
  const id = newId('prt')
  await query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, channel, expires_at, issued_by, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, sha256(rawToken), channel ?? 'manual', expiresAt, issuedBy ?? null, ip ?? null]
  )
  return id
}

export function findResetToken(rawToken) {
  return queryOne(
    `SELECT t.id, t.user_id, t.expires_at, t.used_at, t.created_at,
            u.username, u.display_name, u.status, u.deleted_at
     FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1`,
    [sha256(rawToken)]
  )
}

/** 用后即焚：标记已使用，同时作废该用户其它未使用的重置令牌。 */
export async function consumeResetToken(id, userId) {
  await query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [id])
  await query(
    `UPDATE password_reset_tokens SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL AND id <> $2`,
    [userId, id]
  )
}

export async function invalidateUserResetTokens(userId) {
  const { rowCount } = await query(
    `UPDATE password_reset_tokens SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  )
  return rowCount
}

export async function listResetTokens({ userId, limit, offset }) {
  const { rows } = await query(
    `SELECT t.id, t.user_id, t.channel, t.expires_at, t.used_at, t.created_at,
            t.issued_by, u.username, u.display_name,
            COUNT(*) OVER()::int AS total_count
     FROM password_reset_tokens t
     LEFT JOIN users u ON u.id = t.user_id
     WHERE ($1::text IS NULL OR t.user_id = $1)
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $2 OFFSET $3`,
    [userId || null, limit, offset]
  )
  return rows
}

export async function purgeExpiredResetTokens() {
  const { rowCount } = await query(
    `DELETE FROM password_reset_tokens
     WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'`
  )
  return rowCount
}
