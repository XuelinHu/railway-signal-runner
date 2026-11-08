import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDefaultTrainingScene, DEFAULT_TRAINING_SCENE_ID } from '../src/game/defaultTrainingScene.js'
import { findCatalogItem } from '../src/game/modelCatalog.js'

test('default railway scene uses actual local models and stable equipment IDs', () => {
  const scene = createDefaultTrainingScene()
  assert.equal(scene.id, DEFAULT_TRAINING_SCENE_ID)
  assert.equal(scene.published, true)
  assert.ok(scene.objects.length >= 10)
  assert.ok(scene.tasks.length >= 5)
  assert.equal(new Set(scene.objects.map((item) => item.id)).size, scene.objects.length)
  assert.ok(scene.objects.every((item) => findCatalogItem(item.catalogKey)))
  assert.ok(scene.objects.some((item) => item.catalogKey === 'man'))
  assert.ok(scene.objects.some((item) => item.catalogKey === 'work_man'))
  assert.ok(scene.tasks.every((task) => task.title && task.objectId))
  assert.equal(createDefaultTrainingScene().objects[0].id, scene.objects[0].id)
})
