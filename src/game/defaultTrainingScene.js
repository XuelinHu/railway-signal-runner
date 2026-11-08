import { findCatalogItem } from './modelCatalog.js'
import { serializeTrainingScene } from './sceneSerializer.js'

export const DEFAULT_TRAINING_SCENE_ID = 'builtin-railway-inspection-v1'

const PLACEMENTS = [
  ['进站信号机', '进站信号机', -80, -52, 0, true],
  ['轨旁警示牌glb', '进站警示牌', -92, -75, 0, false],
  ['轨道电路设备箱', '轨道电路设备箱', -55, -35, 0, true],
  ['铁路道岔', '站场道岔', -40, -30, 0, true],
  ['转辙机', '道岔转辙机', -33, -36, 0, true],
  ['电缆槽', '轨旁电缆槽', -14, -5, 0, false],
  ['bridge', '区间铁路桥', 8, 6, 0, false],
  ['应答器', '轨道应答器', 25, 19, 0, true],
  ['信号设备箱', '信号设备箱', 48, 43, 0, true],
  ['work_man', '现场检修人员', 60, 44, 0, false],
  ['出站信号机', '出站信号机', 75, 63, 0, true],
  ['小型车站站台', '终点站台', 102, 73, 0, false],
  ['man', '站台作业人员', 94, 90, 0, false],
]

export function createDefaultTrainingScene() {
  const objects = PLACEMENTS.map(([catalogKey, name, x, z, angle, inspectionPoint], index) => {
    const catalog = findCatalogItem(catalogKey)
    if (!catalog) throw new Error(`示范场景缺少模型：${catalogKey}`)
    const scale = catalog.defaultScale
    return {
      id: `default-equipment-${index + 1}`,
      catalogKey,
      name,
      position: { x, y: 0, z },
      rotation: { x: 0, y: angle, z: 0 },
      scale: { x: scale, y: scale, z: scale },
      interactive: inspectionPoint,
      inspectionPoint,
      task: {
        title: `检查${name}`,
        description: `靠近${name}，观察设备外观与安装位置；如需了解工作原理，可向智能助手提问。`,
        faultType: 'normal',
        expectedAction: 'inspect',
        score: 10,
        hint: `沿轨道寻找${name}`,
      },
    }
  })

  const name = '站场信号设备巡检示范场'
  const scene = serializeTrainingScene(name, objects, {
    description: '亮色站场路线，包含信号机、道岔、转辙机、应答器与作业人员。接近设备后可以向智能助手提问。',
    difficulty: 'easy',
    estimatedMinutes: 18,
    published: true,
  })
  return {
    id: DEFAULT_TRAINING_SCENE_ID,
    name,
    description: scene.metadata.description,
    difficulty: scene.metadata.difficulty,
    estimatedMinutes: scene.metadata.estimatedMinutes,
    published: true,
    objects: scene.objects,
    tasks: scene.tasks,
    payload: scene,
  }
}
