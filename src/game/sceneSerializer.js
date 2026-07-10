export const SCENE_SCHEMA_VERSION = 2

export function serializeTrainingScene(name, objects, options = {}) {
  const normalizedObjects = objects.map(normalizeObject)

  return {
    version: SCENE_SCHEMA_VERSION,
    sceneName: name,
    savedAt: new Date().toISOString(),
    metadata: {
      description: String(options.description || ''),
      difficulty: options.difficulty || 'normal',
      estimatedMinutes: numberOr(options.estimatedMinutes, 10)
    },
    published: Boolean(options.published),
    objects: normalizedObjects,
    tasks: normalizedObjects.filter((object) => object.inspectionPoint).map(objectToTask)
  }
}

export function parseTrainingScene(text) {
  const data = JSON.parse(text)
  if (!data || !Array.isArray(data.objects)) throw new Error('场景文件缺少 objects 数组')

  const objects = data.objects.map(normalizeObject)

  return {
    version: Number(data.version || 1),
    sceneName: String(data.sceneName || '未命名巡检场景'),
    metadata: {
      description: String(data.metadata?.description || ''),
      difficulty: data.metadata?.difficulty || 'normal',
      estimatedMinutes: numberOr(data.metadata?.estimatedMinutes, 10)
    },
    published: Boolean(data.published),
    objects,
    tasks: Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : objects.filter((object) => object.inspectionPoint).map(objectToTask)
  }
}

export function buildSceneTasks(objects) {
  return objects.map(normalizeObject).filter((object) => object.inspectionPoint).map(objectToTask)
}

function normalizeObject(object, index = 0) {
  if (!object.catalogKey) throw new Error(`第 ${index + 1} 个对象缺少 catalogKey`)

  const task = normalizeTask(object.task || {})
  const name = object.name || object.catalogKey

  return {
    id: object.id || `${object.catalogKey}-${Date.now()}-${index}`,
    catalogKey: object.catalogKey,
    name,
    position: normalizeVector(object.position),
    rotation: normalizeVector(object.rotation),
    scale: normalizeVector(object.scale, 1),
    interactive: Boolean(object.interactive),
    inspectionPoint: Boolean(object.inspectionPoint),
    task: {
      title: task.title || `检查${name}`,
      description: task.description || '靠近目标设备后完成巡检确认。',
      faultType: task.faultType,
      expectedAction: task.expectedAction,
      score: task.score,
      hint: task.hint
    }
  }
}

function normalizeTask(task) {
  return {
    title: String(task.title || ''),
    description: String(task.description || ''),
    faultType: String(task.faultType || 'normal'),
    expectedAction: String(task.expectedAction || 'inspect'),
    score: numberOr(task.score, 10),
    hint: String(task.hint || '')
  }
}

function objectToTask(object) {
  return {
    id: object.id,
    objectId: object.id,
    title: object.task?.title || `检查${object.name}`,
    description: object.task?.description || '靠近目标设备后完成巡检确认。',
    faultType: object.task?.faultType || 'normal',
    expectedAction: object.task?.expectedAction || 'inspect',
    score: numberOr(object.task?.score, 10),
    hint: object.task?.hint || '',
    position: roundVector(object.position)
  }
}

function normalizeVector(value, fallback = 0) {
  return {
    x: numberOr(value?.x, fallback),
    y: numberOr(value?.y, fallback),
    z: numberOr(value?.z, fallback)
  }
}

function roundVector(value) {
  return {
    x: round(value.x),
    y: round(value.y),
    z: round(value.z)
  }
}

function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}
