import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { query, queryOne } from '../db/pool.js'
import { newId } from '../utils/id.js'
import { randomToken, sha256 } from './passwordService.js'
import { unauthorized } from '../utils/httpError.js'

export function signAccessToken(user) {
  return jwt.sign({ username: user.username, role: user.role, typ: 'access' }, config.auth.jwtSecret, {
    subject: user.id,
    issuer: config.auth.jwtIssuer,
    expiresIn: config.auth.accessTtlSeconds,
  })
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, { issuer: config.auth.jwtIssuer })
    if (payload.typ !== 'access') throw new Error('token type mismatch')
    return payload
  } catch {
    throw unauthorized()
  }
}

/**
 * 签发刷新令牌。明文只返回给调用方一次，库里只存 sha256。
 * 轮换时沿用同一个 family_id，这样重放检测才能识别出整个令牌家族。
 */
export async function issueRefreshToken(userId, { familyId, ip, userAgent } = {}) {
  const raw = randomToken(32)
  const id = newId('rt')
  const family = familyId ?? newId('fam')
  const expiresAt = new Date(Date.now() + config.auth.refreshTtlSeconds * 1000)

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, sha256(raw), family, expiresAt, ip ?? null, userAgent?.slice(0, 500) ?? null]
  )

  return { raw, id, familyId: family, expiresAt }
}

/**
 * 校验并轮换刷新令牌。
 * 若收到一个已被轮换过的令牌，说明它可能被窃取，整个家族立刻吊销。
 */
export async function rotateRefreshToken(raw, { ip, userAgent } = {}) {
  const hash = sha256(raw)
  const row = await queryOne(
    `SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by
     FROM refresh_tokens WHERE token_hash = $1`,
    [hash]
  )

  if (!row) throw unauthorized('登录状态无效，请重新登录', 'invalid_refresh_token')

  if (row.revoked_at || row.replaced_by) {
    // 重放检测：吊销同一家族里所有仍然有效的令牌。
    await query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [row.family_id]
    )
    throw unauthorized('检测到令牌重复使用，已强制退出，请重新登录', 'refresh_token_reused')
  }

  if (new Date(row.expires_at) <= new Date()) {
    throw unauthorized('登录状态已过期，请重新登录', 'refresh_token_expired')
  }

  const next = await issueRefreshToken(row.user_id, { familyId: row.family_id, ip, userAgent })

  await query(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
    [row.id, next.id]
  )

  return { userId: row.user_id, token: next }
}

export async function revokeRefreshToken(raw) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(raw)]
  )
}

export async function revokeAllUserTokens(userId) {
  const { rowCount } = await query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  )
  return rowCount
}

/** 清理已过期或早已吊销的令牌记录。 */
export async function purgeExpiredTokens() {
  const { rowCount } = await query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < now() - interval '7 days'
        OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`
  )
  return rowCount
}
