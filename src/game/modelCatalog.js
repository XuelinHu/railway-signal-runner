export const MODEL_CATEGORIES = [
  { key: 'track', name: '轨道基础' },
  { key: 'signal', name: '信号设备' },
  { key: 'switch', name: '道岔设备' },
  { key: 'equipment', name: '轨旁设施' },
  { key: 'environment', name: '站场环境' },
  { key: 'person', name: '人员角色' },
  { key: 'tool', name: '巡检工具' }
]

const MODEL_FILES = [
  ['巡检终端.glb', '巡检终端', 'tool', 2.2, true, false],
  ['man.glb', '作业人员', 'person', 4.5, false, false],
  ['电缆槽.glb', '电缆槽', 'equipment', 2.6, false, false],
  ['轨道电路设备箱.glb', '轨道电路设备箱', 'equipment', 3.2, true, true],
  ['应答器.glb', '应答器', 'equipment', 2.2, true, true],
  ['locomotive.glb', '机车', 'environment', 7, false, false],
  ['box.glb', '设备箱', 'equipment', 3.2, true, true],
  ['work_man.glb', '检修人员', 'person', 4.5, false, false],
  ['小型车站站台.glb', '小型车站站台', 'environment', 7, false, false],
  ['铁路道岔.glb', '铁路道岔', 'switch', 6, true, true],
  ['bridge.glb', '铁路桥梁', 'environment', 8, false, false],
  ['故障标记牌.glb', '故障标记牌', 'tool', 2.4, true, true],
  ['手电筒.glb', '手电筒', 'tool', 1.8, false, false],
  ['维修工具箱.glb', '维修工具箱', 'tool', 2.4, false, false],
  ['转辙机.glb', '转辙机', 'switch', 3.2, true, true],
  ['静态机车.glb', '静态机车', 'environment', 7, false, false],
  ['调车信号机.glb', '调车信号机', 'signal', 3.4, true, true],
  ['sign.glb', '信号机', 'signal', 3.4, true, true],
  ['railway.glb', '铁路轨道', 'track', 8, false, false],
  ['直线铁路轨道基础段.glb', '直线铁路轨道基础段', 'track', 6, false, false],
  ['进站信号机.glb', '进站信号机', 'signal', 3.4, true, true],
  ['弯道铁路轨道段.glb', '弯道铁路轨道段', 'track', 6, false, false],
  ['轨旁警示牌glb.glb', '轨旁警示牌', 'equipment', 2.8, true, true],
  ['出站信号机.glb', '出站信号机', 'signal', 3.4, true, true],
  ['小型站房.glb', '小型站房', 'environment', 7, false, false],
  ['信号设备箱.glb', '信号设备箱', 'equipment', 3.2, true, true],
  ['百米标.glb', '百米标', 'equipment', 2.2, true, false],
  ['公里标.glb', '公里标', 'equipment', 2.2, true, false],
  ['station.glb', '车站', 'environment', 7, false, false],
  ['防护栅栏.glb', '防护栅栏', 'environment', 4, false, false]
]

export const MODEL_CATALOG = MODEL_FILES.map(([fileName, name, category, defaultScale, interactive, inspectionPoint]) => ({
  key: fileName.replace(/\.glb$/i, ''),
  name,
  category,
  fileName,
  modelUrl: `/assets/models/${fileName}`,
  thumbnailUrl: '',
  defaultScale,
  interactive,
  inspectionPoint,
  snap: 'ground'
}))

export function findCatalogItem(key) {
  return MODEL_CATALOG.find((item) => item.key === key)
}
