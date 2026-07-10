import Dexie from 'dexie'
import { nanoid } from 'nanoid'

export const trainingSceneDb = new Dexie('railway-signal-runner')

trainingSceneDb.version(1).stores({
  scenes: 'id, name, updatedAt, createdAt',
  records: 'id, sceneId, createdAt'
})

trainingSceneDb.version(2).stores({
  scenes: 'id, name, published, updatedAt, createdAt',
  records: 'id, sceneId, createdAt'
})

export async function saveTrainingScene(scene) {
  const now = new Date().toISOString()
  const id = scene.id || nanoid()
  const nextScene = {
    ...scene,
    id,
    createdAt: scene.createdAt || now,
    updatedAt: now
  }
  await trainingSceneDb.scenes.put(nextScene)
  return nextScene
}

export function listTrainingScenes() {
  return trainingSceneDb.scenes.orderBy('updatedAt').reverse().toArray()
}

export async function listPublishedTrainingScenes() {
  const scenes = await listTrainingScenes()
  return scenes.filter((scene) => scene.published)
}

export function getTrainingScene(id) {
  return trainingSceneDb.scenes.get(id)
}

export async function deleteTrainingScene(id) {
  await trainingSceneDb.scenes.delete(id)
}

export async function saveTrainingRecord(record) {
  const now = new Date().toISOString()
  const nextRecord = {
    ...record,
    id: record.id || nanoid(),
    createdAt: now
  }
  await trainingSceneDb.records.put(nextRecord)
  return nextRecord
}
