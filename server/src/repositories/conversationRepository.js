import { query, queryOne } from '../db/pool.js'
import { newId } from '../utils/id.js'

export async function createConversation({ userId, title, model, systemPrompt }) {
  return queryOne(
    `INSERT INTO ai_conversations (id, user_id, title, model, system_prompt)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, model, message_count, created_at, updated_at`,
    [newId('c'), userId, title || '新对话', model || '', systemPrompt || null]
  )
}

export function getConversation(id) {
  return queryOne(
    `SELECT id, user_id, title, model, system_prompt, message_count, last_message_at, created_at, updated_at
     FROM ai_conversations WHERE id = $1`,
    [id]
  )
}

export async function appendMessage({ conversationId, userId, role, content, model, status, error }) {
  const row = await queryOne(
    `INSERT INTO ai_messages (conversation_id, user_id, role, content, model, status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, conversation_id, role, content, model, status, created_at`,
    [conversationId, userId ?? null, role, content ?? '', model ?? null, status ?? 'ok', error ?? null]
  )

  await query(
    `UPDATE ai_conversations
     SET message_count = message_count + 1,
         last_message_at = now(),
         model = COALESCE(NULLIF($2, ''), model)
     WHERE id = $1`,
    [conversationId, model ?? '']
  )

  return row
}

export async function completeAssistantMessage(id, { content, promptTokens, completionTokens, latencyMs, status, error }) {
  return queryOne(
    `UPDATE ai_messages
     SET content = $2, prompt_tokens = $3, completion_tokens = $4, latency_ms = $5,
         status = $6, error = $7
     WHERE id = $1
     RETURNING id, content, status`,
    [id, content ?? '', promptTokens ?? null, completionTokens ?? null, latencyMs ?? null, status ?? 'ok', error ?? null]
  )
}

/** 取最近 N 条历史作为对话上下文（按时间正序返回）。 */
export async function recentMessages(conversationId, limit = 20) {
  const { rows } = await query(
    `SELECT role, content FROM (
       SELECT id, role, content, created_at
       FROM ai_messages
       WHERE conversation_id = $1 AND status <> 'error' AND content <> ''
       ORDER BY id DESC
       LIMIT $2
     ) t ORDER BY t.id ASC`,
    [conversationId, limit]
  )
  return rows
}

export async function listMessages(conversationId, { limit, offset }) {
  const { rows } = await query(
    `SELECT id, role, content, model, prompt_tokens, completion_tokens, latency_ms, status, created_at,
            COUNT(*) OVER()::int AS total_count
     FROM ai_messages
     WHERE conversation_id = $1
     ORDER BY id ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  )
  return rows
}

export async function listUserConversations(userId, { limit, offset, q }) {
  const { rows } = await query(
    `SELECT id, title, model, message_count, last_message_at, created_at, updated_at,
            COUNT(*) OVER()::int AS total_count
     FROM ai_conversations
     WHERE user_id = $1 AND archived = FALSE
       AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%')
     ORDER BY updated_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [userId, q || null, limit, offset]
  )
  return rows
}

export async function adminListConversations({ userId, q, model, limit, offset }) {
  const { rows } = await query(
    `SELECT c.id, c.user_id, c.title, c.model, c.message_count, c.last_message_at,
            c.created_at, c.updated_at,
            u.username, u.display_name,
            COUNT(*) OVER()::int AS total_count
     FROM ai_conversations c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE ($1::text IS NULL OR c.user_id = $1)
       AND ($2::text IS NULL OR c.title ILIKE '%' || $2 || '%' OR u.username ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR c.model = $3)
     ORDER BY c.updated_at DESC, c.id DESC
     LIMIT $4 OFFSET $5`,
    [userId || null, q || null, model || null, limit, offset]
  )
  return rows
}

export async function renameConversation(id, title) {
  return queryOne(
    `UPDATE ai_conversations SET title = $2 WHERE id = $1 RETURNING id, title`,
    [id, title]
  )
}

export async function deleteConversation(id) {
  const { rowCount } = await query(`DELETE FROM ai_conversations WHERE id = $1`, [id])
  return rowCount > 0
}

export async function countConversations() {
  return queryOne(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE updated_at > now() - interval '7 days')::int AS recent
     FROM ai_conversations`
  )
}

export async function countMessages() {
  return queryOne(`SELECT COUNT(*)::int AS total FROM ai_messages`)
}
