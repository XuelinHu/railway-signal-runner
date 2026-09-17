import { query, queryOne } from '../db/pool.js'
import { newId } from '../utils/id.js'

export async function listScenes({ ownerId, q, published, includeDeleted = false, limit, offset }) {
  const { rows } = await query(
    `SELECT s.id, s.name, s.description, s.difficulty, s.published, s.published_at,
            s.owner_id, s.created_at, s.updated_at,
            u.username AS owner_name, u.display_name AS owner_display_name,
            COUNT(*) OVER()::int AS total_count
     FROM training_scenes s
     LEFT JOIN users u ON u.id = s.owner_id
     WHERE ($1::boolean OR s.deleted_at IS NULL)
       AND ($2::text IS NULL OR s.owner_id = $2)
       AND ($3::text IS NULL OR s.name ILIKE '%' || $3 || '%' OR s.description ILIKE '%' || $3 || '%')
       AND ($4::boolean IS NULL OR s.published = $4)
     ORDER BY s.updated_at DESC, s.id DESC
     LIMIT $5 OFFSET $6`,
    [includeDeleted, ownerId || null, q || null, published ?? null, limit, offset]
  )
  return rows
}

/** 学生端用：已发布的场景，不需要分页信封里的 owner 信息。 */
export async function listPublishedScenes({ limit = 100, offset = 0 }) {
  const { rows } = await query(
    `SELECT s.id, s.name, s.description, s.difficulty, s.published, s.published_at,
            s.payload, s.created_at, s.updated_at,
            COUNT(*) OVER()::int AS total_count
     FROM training_scenes s
     WHERE s.published = TRUE AND s.deleted_at IS NULL
     ORDER BY s.updated_at DESC, s.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  return rows
}

export function getScene(id) {
  return queryOne(
    `SELECT id, name, description, difficulty, published, published_at, owner_id,
            payload, created_at, updated_at, deleted_at
     FROM training_scenes WHERE id = $1`,
    [id]
  )
}

export async function upsertScene({ id, name, description, difficulty, ownerId, payload }) {
  const sceneId = id || newId('scene')
  return queryOne(
    `INSERT INTO training_scenes (id, name, description, difficulty, owner_id, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           difficulty = EXCLUDED.difficulty,
           payload = EXCLUDED.payload,
           updated_at = now()
     RETURNING id, name, description, difficulty, published, owner_id, created_at, updated_at`,
    [
      sceneId,
      name,
      description ?? null,
      difficulty ?? null,
      ownerId ?? null,
      JSON.stringify(payload ?? {}),
    ]
  )
}

export async function setPublished(id, published) {
  return queryOne(
    `UPDATE training_scenes
     SET published = $2, published_at = CASE WHEN $2 THEN now() ELSE NULL END
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, published, published_at, updated_at`,
    [id, published]
  )
}

export async function softDeleteScene(id) {
  const { rowCount } = await query(
    `UPDATE training_scenes SET deleted_at = now(), published = FALSE
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rowCount > 0
}

export async function listRecords({ userId, sceneId, q, completed, limit, offset }) {
  const { rows } = await query(
    `SELECT r.id, r.scene_id, r.scene_name, r.student_name, r.score, r.elapsed_seconds,
            r.completed, r.inspected_count, r.mistake_count, r.user_id, r.created_at,
            u.username, u.display_name,
            COUNT(*) OVER()::int AS total_count
     FROM training_records r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE ($1::text IS NULL OR r.user_id = $1)
       AND ($2::text IS NULL OR r.scene_id = $2)
       AND ($3::text IS NULL OR r.student_name ILIKE '%' || $3 || '%' OR r.scene_name ILIKE '%' || $3 || '%')
       AND ($4::boolean IS NULL OR r.completed = $4)
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $5 OFFSET $6`,
    [userId || null, sceneId || null, q || null, completed ?? null, limit, offset]
  )
  return rows
}

export async function insertRecord(record) {
  const id = record.id || newId('rec')
  return queryOne(
    `INSERT INTO training_records
       (id, scene_id, scene_name, student_name, score, elapsed_seconds, payload,
        user_id, completed, inspected_count, mistake_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, scene_id, scene_name, student_name, score, elapsed_seconds, completed, created_at`,
    [
      id,
      record.sceneId ?? null,
      record.sceneName ?? null,
      record.studentName ?? null,
      record.score ?? null,
      record.elapsedSeconds ?? null,
      JSON.stringify(record.payload ?? {}),
      record.userId ?? null,
      record.completed ?? false,
      record.inspectedCount ?? null,
      record.mistakeCount ?? null,
    ]
  )
}

export async function sceneStats() {
  return queryOne(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE published)::int AS published,
       COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
     FROM training_scenes`
  )
}

export async function recordStats() {
  return queryOne(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE completed)::int AS completed,
       COALESCE(ROUND(AVG(score))::int, 0) AS avg_score,
       COALESCE(SUM(elapsed_seconds), 0)::int AS total_seconds
     FROM training_records`
  )
}
