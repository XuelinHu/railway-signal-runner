import { query, queryOne } from '../db/pool.js'

export async function insertLoginLog({ userId, usernameInput, success, failureReason, ip, userAgent }) {
  await query(
    `INSERT INTO login_logs (user_id, username_input, success, failure_reason, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId ?? null,
      usernameInput?.slice(0, 150) ?? null,
      success,
      failureReason ?? null,
      ip ?? null,
      userAgent?.slice(0, 500) ?? null,
    ]
  )
}

/** 登录日志分页。支持按用户、结果、时间范围筛选。 */
export async function listLoginLogs({ userId, username, success, from, to, limit, offset }) {
  const { rows } = await query(
    `SELECT l.id, l.user_id, l.username_input, l.success, l.failure_reason,
            l.ip, l.user_agent, l.created_at,
            u.display_name, u.username AS user_name, u.role,
            COUNT(*) OVER()::int AS total_count
     FROM login_logs l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE ($1::text IS NULL OR l.user_id = $1)
       AND ($2::text IS NULL OR l.username_input ILIKE '%' || $2 || '%')
       AND ($3::boolean IS NULL OR l.success = $3)
       AND ($4::timestamptz IS NULL OR l.created_at >= $4)
       AND ($5::timestamptz IS NULL OR l.created_at <= $5)
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $6 OFFSET $7`,
    [userId || null, username || null, success ?? null, from || null, to || null, limit, offset]
  )
  return rows
}

export async function insertAuditLog({ userId, username, action, targetType, targetId, detail, ip }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, username, action, target_type, target_id, detail, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId ?? null,
        username ?? null,
        action,
        targetType ?? null,
        targetId ?? null,
        detail ? JSON.stringify(detail) : null,
        ip ?? null,
      ]
    )
  } catch (error) {
    // 审计写入失败不应该让主业务失败，只记录告警。
    console.warn('[audit] 写入审计日志失败：', error.message)
  }
}

export async function listAuditLogs({ userId, action, from, to, limit, offset }) {
  const { rows } = await query(
    `SELECT a.id, a.user_id, a.username, a.action, a.target_type, a.target_id,
            a.detail, a.ip, a.created_at,
            u.display_name,
            COUNT(*) OVER()::int AS total_count
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE ($1::text IS NULL OR a.user_id = $1)
       AND ($2::text IS NULL OR a.action = $2)
       AND ($3::timestamptz IS NULL OR a.created_at >= $3)
       AND ($4::timestamptz IS NULL OR a.created_at <= $4)
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $5 OFFSET $6`,
    [userId || null, action || null, from || null, to || null, limit, offset]
  )
  return rows
}

export async function insertAiRequestLog(entry) {
  try {
    await query(
      `INSERT INTO ai_request_logs
         (user_id, conversation_id, model, endpoint, status, http_status,
          latency_ms, first_token_ms, prompt_tokens, completion_tokens, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.userId ?? null,
        entry.conversationId ?? null,
        entry.model,
        entry.endpoint ?? 'chat',
        entry.status ?? 'ok',
        entry.httpStatus ?? null,
        entry.latencyMs ?? null,
        entry.firstTokenMs ?? null,
        entry.promptTokens ?? null,
        entry.completionTokens ?? null,
        entry.error?.slice(0, 1000) ?? null,
      ]
    )
  } catch (error) {
    console.warn('[ai-log] 写入调用日志失败：', error.message)
  }
}

export async function listAiRequestLogs({ userId, model, status, from, to, limit, offset }) {
  const { rows } = await query(
    `SELECT r.id, r.user_id, r.conversation_id, r.model, r.endpoint, r.status,
            r.http_status, r.latency_ms, r.first_token_ms,
            r.prompt_tokens, r.completion_tokens, r.error, r.created_at,
            u.display_name, u.username,
            COUNT(*) OVER()::int AS total_count
     FROM ai_request_logs r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE ($1::text IS NULL OR r.user_id = $1)
       AND ($2::text IS NULL OR r.model = $2)
       AND ($3::text IS NULL OR r.status = $3)
       AND ($4::timestamptz IS NULL OR r.created_at >= $4)
       AND ($5::timestamptz IS NULL OR r.created_at <= $5)
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $6 OFFSET $7`,
    [userId || null, model || null, status || null, from || null, to || null, limit, offset]
  )
  return rows
}

export async function aiLogSummary() {
  return queryOne(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'ok')::int      AS ok_count,
       COUNT(*) FILTER (WHERE status <> 'ok')::int     AS error_count,
       COALESCE(ROUND(AVG(latency_ms))::int, 0)        AS avg_latency_ms,
       COALESCE(SUM(prompt_tokens + completion_tokens), 0)::int AS total_tokens
     FROM ai_request_logs
     WHERE created_at > now() - interval '7 days'`
  )
}

export async function loginSummary() {
  return queryOne(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE success)::int  AS success_count,
       COUNT(*) FILTER (WHERE NOT success)::int AS failure_count
     FROM login_logs
     WHERE created_at > now() - interval '7 days'`
  )
}

/** 概览页的最近登录，同样走分页信封。 */
export async function recentLogins({ limit, offset }) {
  const { rows } = await query(
    `SELECT l.id, l.username_input, l.success, l.failure_reason, l.ip, l.created_at,
            u.display_name,
            COUNT(*) OVER()::int AS total_count
     FROM login_logs l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.success = TRUE
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  return rows
}
