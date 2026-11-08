import { closePool } from '../server/src/db/pool.js'
import { ensureDefaultCloudScene } from '../server/src/services/defaultSceneService.js'

try {
  const result = await ensureDefaultCloudScene()
  console.log(result.inserted ? `示范场景已创建：${result.id}` : `示范场景已存在，未覆盖：${result.id}`)
} finally {
  await closePool()
}
