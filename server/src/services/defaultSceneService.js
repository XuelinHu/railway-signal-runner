import { query } from '../db/pool.js'
import { createDefaultTrainingScene } from '../../../src/game/defaultTrainingScene.js'

export async function ensureDefaultCloudScene() {
  const scene = createDefaultTrainingScene()
  const { rowCount } = await query(
    `INSERT INTO training_scenes
       (id, name, description, difficulty, published, published_at, owner_id, payload)
     VALUES ($1, $2, $3, $4, TRUE, now(), NULL, $5::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [scene.id, scene.name, scene.description, scene.difficulty, JSON.stringify(scene.payload)]
  )
  return { id: scene.id, inserted: rowCount > 0 }
}
