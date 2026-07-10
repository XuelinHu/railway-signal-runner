<template>
  <main class="app-shell">
    <section
      ref="stageRef"
      class="game-stage"
      :class="{ 'editor-active': editorMode }"
      @dragover.prevent
      @drop.prevent="dropModel"
    >
      <canvas ref="canvasRef" class="game-canvas"></canvas>

      <header class="topbar">
        <div class="brand-block">
          <div class="brand-mark"></div>
          <div class="brand-copy">
            <strong>第一人称铁道信号巡检仿真实训平台</strong>
            <span>{{ editorMode ? '场景布置模式' : '巡检训练模式' }}</span>
          </div>
        </div>

        <div class="action-group">
          <button
            v-if="isTeacher"
            class="tool-button"
            type="button"
            :class="{ primary: editorMode }"
            title="场景布置"
            @click="switchMode('editor')"
          >
            <Box :size="18" />
            <span>布置</span>
          </button>
          <button
            class="tool-button"
            type="button"
            :class="{ primary: !editorMode && !gameState.running }"
            title="巡检训练"
            @click="switchMode('train')"
          >
            <ShieldCheck :size="18" />
            <span>巡检</span>
          </button>
          <button
            v-if="!gameState.running"
            class="tool-button primary"
            type="button"
            title="开始"
            :disabled="editorMode || !gameState.ready || gameState.completed"
            @click="startGame"
          >
            <Play :size="18" />
            <span>开始</span>
          </button>
          <button v-else class="tool-button" type="button" title="暂停" @click="pauseGame">
            <Pause :size="18" />
            <span>暂停</span>
          </button>
          <button class="tool-button" type="button" title="重置" @click="resetGame">
            <RotateCcw :size="18" />
            <span>重置</span>
          </button>
          <button v-if="isTeacher" class="icon-button" type="button" title="保存场景" @click="saveScene">
            <Download :size="19" />
          </button>
          <button v-if="isTeacher" class="icon-button" type="button" title="加载场景" @click="fileInputRef?.click()">
            <Upload :size="19" />
          </button>
          <button class="icon-button" type="button" :title="mapVisible ? '隐藏地图' : '显示地图'" @click="mapVisible = !mapVisible">
            <MapPinned v-if="mapVisible" :size="19" />
            <Map v-else :size="19" />
          </button>
          <button class="icon-button" type="button" :title="gameState.audioEnabled ? '关闭音效' : '开启音效'" @click="toggleAudio">
            <Volume2 v-if="gameState.audioEnabled" :size="19" />
            <VolumeX v-else :size="19" />
          </button>
          <input ref="fileInputRef" class="hidden-file-input" type="file" accept="application/json,.json" @change="loadScene" />
        </div>
      </header>

      <div v-if="!editorMode" class="crosshair" aria-hidden="true"></div>

      <section v-if="!editorMode" class="metric-strip" aria-label="巡视状态">
        <div class="metric-item">
          <Clock :size="16" />
          <span>{{ elapsedText }}</span>
        </div>
        <div class="metric-item">
          <Gauge :size="16" />
          <span>{{ Math.round(gameState.speed) }} km/h</span>
        </div>
        <div class="metric-item">
          <Route :size="16" />
          <span>{{ Math.round(gameState.distance) }} m</span>
        </div>
        <div class="metric-item">
          <ShieldCheck :size="16" />
          <span>{{ completionRatio }}%</span>
        </div>
      </section>

      <aside v-if="!editorMode" class="mission-panel">
        <header>
          <span>巡检目标</span>
          <strong>{{ gameState.inspected }}/{{ gameState.total }}</strong>
        </header>
        <div class="progress-track">
          <span :style="{ width: `${completionRatio}%` }"></span>
        </div>
        <div
          v-for="signal in signals"
          :key="signal.id"
          class="target-row"
          :class="{ done: signal.inspected, active: signal.id === gameState.nearestId && !signal.inspected }"
        >
          <span class="target-dot" :class="[`state-${signal.state}`, { inspected: signal.inspected }]"></span>
          <div>
            <strong>{{ signal.id }}</strong>
            <span>{{ signal.label }}</span>
          </div>
          <CheckCircle2 v-if="signal.inspected" :size="17" />
        </div>
      </aside>

      <aside v-if="editorMode" class="model-library-panel">
        <header class="block-palette-header">
          <div>
            <span>模型资源</span>
            <strong>铁路场景构件库</strong>
          </div>
          <em>{{ sceneObjects.length }}</em>
        </header>

        <section class="scene-settings-card">
          <label>
            <span>场景名称</span>
            <input v-model.trim="sceneForm.name" type="text" placeholder="铁道信号巡检训练场景" />
          </label>
          <label>
            <span>场景说明</span>
            <textarea v-model.trim="sceneForm.description" rows="3" placeholder="说明学生需要完成的巡检任务"></textarea>
          </label>
          <div class="scene-settings-row">
            <label>
              <span>难度</span>
              <select v-model="sceneForm.difficulty">
                <option value="easy">基础</option>
                <option value="normal">标准</option>
                <option value="hard">进阶</option>
              </select>
            </label>
            <label>
              <span>时长</span>
              <input v-model.number="sceneForm.estimatedMinutes" type="number" min="1" max="90" />
            </label>
          </div>
          <label class="inline-toggle">
            <input v-model="sceneForm.published" type="checkbox" />
            <span>发布给学生</span>
          </label>
        </section>

        <section v-for="group in categorizedCatalog" :key="group.key" class="model-category">
          <h2>{{ group.name }}</h2>
          <div class="block-grid">
          <button
            v-for="item in group.items"
            :key="item.key"
            class="model-card"
            type="button"
            draggable="true"
            @dragstart="dragModel($event, item.key)"
            @click="addModel(item.key)"
          >
            <ModelThumbnail :url="item.modelUrl" :label="item.name" />
            <span class="model-meta">
              <strong>{{ item.name }}</strong>
              <small>{{ item.inspectionPoint ? '巡检点' : '场景构件' }}</small>
            </span>
          </button>
          </div>
        </section>
      </aside>

      <section v-if="editorMode" class="scene-object-inspector" :class="{ 'has-selection': selectedObject }">
        <header>
          <span>对象属性</span>
          <strong>{{ selectedObject?.name || '未选中' }}</strong>
        </header>
        <div class="transform-mode-tabs" role="group" aria-label="变换模式">
          <button type="button" :class="{ active: transformMode === 'move' }" title="移动模式 (G)" @click="transformMode = 'move'">
            <Move3d :size="17" />
            <span>移动</span>
          </button>
          <button type="button" :class="{ active: transformMode === 'rotate' }" title="旋转模式 (R)" @click="transformMode = 'rotate'">
            <Rotate3d :size="17" />
            <span>旋转</span>
          </button>
          <button type="button" :class="{ active: transformMode === 'scale' }" title="缩放模式 (S)" @click="transformMode = 'scale'">
            <Scaling :size="17" />
            <span>缩放</span>
          </button>
        </div>
        <div class="editor-actions">
          <button class="icon-button" type="button" title="前移" :disabled="!selectedObject" @click="moveSelected(0, -2)">
            <ChevronUp :size="18" />
          </button>
          <button class="icon-button" type="button" title="左移" :disabled="!selectedObject" @click="moveSelected(-2, 0)">
            <ChevronLeft :size="18" />
          </button>
          <button class="icon-button" type="button" title="右移" :disabled="!selectedObject" @click="moveSelected(2, 0)">
            <ChevronRight :size="18" />
          </button>
          <button class="icon-button" type="button" title="后移" :disabled="!selectedObject" @click="moveSelected(0, 2)">
            <ChevronDown :size="18" />
          </button>
          <button class="tool-button" type="button" :disabled="!selectedObject" @click="rotateSelectedByStep(-1)">
            <RotateCcw :size="17" />
            <span>左转</span>
          </button>
          <button class="tool-button" type="button" :disabled="!selectedObject" @click="rotateSelectedByStep(1)">
            <RotateCw :size="17" />
            <span>右转</span>
          </button>
          <button class="tool-button danger" type="button" :disabled="!selectedObject" @click="deleteSelected">
            <Trash2 :size="17" />
            <span>删除</span>
          </button>
          <button class="tool-button" type="button" :disabled="sceneObjects.length === 0" @click="clearScene">
            <RotateCcw :size="17" />
            <span>清空</span>
          </button>
        </div>

        <div v-if="selectedObject" class="object-transform-card">
          <div class="property-section-title">
            <strong>变换</strong>
            <label>
              <span>旋转步长</span>
              <input v-model.number="rotationStep" type="number" min="0.1" max="360" step="0.5" />
              <em>°</em>
            </label>
          </div>

          <div class="transform-property-row">
            <span>位置</span>
            <label class="axis-x"><b>X</b><input :value="formatNumber(selectedObject.position.x)" type="number" step="0.1" @change="setTransformAxis('position', 'x', $event.target.value)" /></label>
            <label class="axis-y"><b>Y</b><input :value="formatNumber(selectedObject.position.y)" type="number" step="0.1" @change="setTransformAxis('position', 'y', $event.target.value)" /></label>
            <label class="axis-z"><b>Z</b><input :value="formatNumber(selectedObject.position.z)" type="number" step="0.1" @change="setTransformAxis('position', 'z', $event.target.value)" /></label>
          </div>
          <div class="transform-property-row">
            <span>旋转</span>
            <label class="axis-x"><b>X</b><input :value="formatDegrees(selectedObject.rotation.x)" type="number" step="1" @change="setRotationAxis('x', $event.target.value)" /></label>
            <label class="axis-y"><b>Y</b><input :value="formatDegrees(selectedObject.rotation.y)" type="number" step="1" @change="setRotationAxis('y', $event.target.value)" /></label>
            <label class="axis-z"><b>Z</b><input :value="formatDegrees(selectedObject.rotation.z)" type="number" step="1" @change="setRotationAxis('z', $event.target.value)" /></label>
          </div>
          <div class="transform-property-row">
            <span>缩放</span>
            <label class="axis-x"><b>X</b><input :value="formatNumber(selectedObject.scale.x)" type="number" min="0.01" step="0.1" @change="setTransformAxis('scale', 'x', $event.target.value)" /></label>
            <label class="axis-y"><b>Y</b><input :value="formatNumber(selectedObject.scale.y)" type="number" min="0.01" step="0.1" @change="setTransformAxis('scale', 'y', $event.target.value)" /></label>
            <label class="axis-z"><b>Z</b><input :value="formatNumber(selectedObject.scale.z)" type="number" min="0.01" step="0.1" @change="setTransformAxis('scale', 'z', $event.target.value)" /></label>
          </div>
        </div>

        <div v-if="selectedObject" class="object-task-card">
          <div class="property-section-title"><strong>巡检任务</strong></div>
          <label class="inline-toggle">
            <input :checked="selectedObject.inspectionPoint" type="checkbox" @change="updateSelectedObject({ inspectionPoint: $event.target.checked, interactive: $event.target.checked || selectedObject.interactive })" />
            <span>设为学生巡检点</span>
          </label>
          <label>
            <span>任务标题</span>
            <input :value="selectedObject.task?.title || `检查${selectedObject.name}`" type="text" @input="updateSelectedTask({ title: $event.target.value })" />
          </label>
          <label>
            <span>任务说明</span>
            <textarea :value="selectedObject.task?.description || ''" rows="3" @input="updateSelectedTask({ description: $event.target.value })"></textarea>
          </label>
          <div class="scene-settings-row">
            <label>
              <span>故障类型</span>
              <select :value="selectedObject.task?.faultType || 'normal'" @change="updateSelectedTask({ faultType: $event.target.value })">
                <option value="normal">正常巡检</option>
                <option value="signal_light_abnormal">信号灯异常</option>
                <option value="switch_machine_fault">转辙机故障</option>
                <option value="equipment_box_fault">设备箱异常</option>
              </select>
            </label>
            <label>
              <span>分值</span>
              <input :value="selectedObject.task?.score || 10" type="number" min="1" max="100" @input="updateSelectedTask({ score: Number($event.target.value) })" />
            </label>
          </div>
          <label>
            <span>提示</span>
            <input :value="selectedObject.task?.hint || ''" type="text" @input="updateSelectedTask({ hint: $event.target.value })" />
          </label>
        </div>
      </section>

      <section class="objective-dock">
        <div>
          <span class="objective-label">{{ editorMode ? '场景布置' : gameState.phase }}</span>
          <strong>{{ editorMode ? editorObjectiveText : objectiveText }}</strong>
        </div>
        <div class="coordinate-readout">
          <span>{{ gameState.geo.lon.toFixed(5) }}</span>
          <span>{{ gameState.geo.lat.toFixed(5) }}</span>
        </div>
      </section>

      <CesiumMiniMap
        v-show="mapVisible"
        class="map-dock"
        :player="gameState"
        :signals="signals"
      />

      <div v-if="!gameState.ready" class="center-panel loading-panel">
        <LoaderCircle :size="28" />
        <strong>{{ gameState.loading }}</strong>
      </div>
      <div v-else-if="!editorMode && !gameState.running && !gameState.completed" class="center-panel start-panel">
        <img src="/assets/images/locamotive_bg.png" alt="" />
        <div class="start-copy">
          <span>信号巡视任务</span>
          <strong>{{ gameState.phase }}</strong>
        </div>
        <button class="launch-button" type="button" @click="startGame">
          <Play :size="20" />
          <span>开始巡视</span>
        </button>
      </div>
      <div v-else-if="gameState.completed" class="center-panel complete-panel">
        <Flag :size="30" />
        <strong>任务完成</strong>
        <span>{{ elapsedText }} · {{ Math.round(gameState.distance) }} m</span>
        <button class="launch-button" type="button" @click="resetGame">
          <RotateCcw :size="18" />
          <span>重新开始</span>
        </button>
      </div>

      <div v-if="toast && toast.type !== 'editor'" class="toast" :class="`toast-${toast.type}`">
        {{ toast.message }}
      </div>

      <nav v-if="!editorMode" class="mobile-controls" aria-label="移动控制">
        <button type="button" @pointerdown="press('forward')" @pointerup="release('forward')" @pointerleave="release('forward')">
          <ChevronUp :size="22" />
        </button>
        <button type="button" @pointerdown="press('left')" @pointerup="release('left')" @pointerleave="release('left')">
          <ChevronLeft :size="22" />
        </button>
        <button type="button" @pointerdown="press('right')" @pointerup="release('right')" @pointerleave="release('right')">
          <ChevronRight :size="22" />
        </button>
        <button type="button" @pointerdown="press('backward')" @pointerup="release('backward')" @pointerleave="release('backward')">
          <ChevronDown :size="22" />
        </button>
      </nav>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Flag,
  Gauge,
  LoaderCircle,
  Map,
  MapPinned,
  Move3d,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Rotate3d,
  Route,
  Scaling,
  ShieldCheck,
  Trash2,
  Upload,
  Volume2,
  VolumeX
} from '@lucide/vue'
import CesiumMiniMap from './CesiumMiniMap.vue'
import ModelThumbnail from './ModelThumbnail.vue'
import { MODEL_CATALOG, MODEL_CATEGORIES } from '../game/modelCatalog'
import { parseTrainingScene, serializeTrainingScene } from '../game/sceneSerializer'
import { getTrainingScene, saveTrainingScene } from '../game/trainingSceneDb'
import { createRailwayGame, SIGNAL_POINTS, worldToGeo } from '../game/railwayGame'

const props = defineProps({
  initialMode: {
    type: String,
    default: 'train'
  },
  role: {
    type: String,
    default: 'student'
  },
  sceneId: {
    type: String,
    default: ''
  }
})

const canvasRef = ref(null)
const stageRef = ref(null)
const fileInputRef = ref(null)
const mapVisible = ref(true)
const editorMode = ref(props.initialMode === 'editor')
const gameApi = ref(null)
const toast = ref(null)
const sceneObjects = ref([])
const selectedObjectId = ref(null)
const transformMode = ref('move')
const rotationStep = ref(15)
const sceneForm = ref({
  name: '铁道信号巡检训练场景',
  description: '',
  difficulty: 'normal',
  estimatedMinutes: 10,
  published: true
})
let toastTimer = 0

const gameState = ref({
  ready: false,
  running: false,
  locked: false,
  loading: '初始化场景',
  elapsed: 0,
  speed: 0,
  distance: 0,
  health: 100,
  inspected: 0,
  total: SIGNAL_POINTS.length,
  completed: false,
  phase: '模型加载',
  nearestId: SIGNAL_POINTS[0].id,
  nearestLabel: SIGNAL_POINTS[0].label,
  nearestDistance: 0,
  position: { x: -116, y: 3.6, z: -87 },
  heading: 0,
  geo: worldToGeo(-116, -87),
  audioEnabled: false
})

const signals = ref(SIGNAL_POINTS.map((signal) => ({
  ...signal,
  inspected: false,
  geo: worldToGeo(signal.x, signal.z)
})))

const categorizedCatalog = computed(() => MODEL_CATEGORIES
  .map((category) => ({
    ...category,
    items: MODEL_CATALOG.filter((item) => item.category === category.key)
  }))
  .filter((category) => category.items.length > 0))

const selectedObject = computed(() => sceneObjects.value.find((object) => object.id === selectedObjectId.value))
const isTeacher = computed(() => props.role === 'teacher')

const completionRatio = computed(() => {
  if (!gameState.value.total) return 0
  return Math.round((gameState.value.inspected / gameState.value.total) * 100)
})

const elapsedText = computed(() => {
  const total = Math.floor(gameState.value.elapsed)
  const minutes = `${Math.floor(total / 60)}`.padStart(2, '0')
  const seconds = `${total % 60}`.padStart(2, '0')
  return `${minutes}:${seconds}`
})

const objectiveText = computed(() => {
  if (gameState.value.completed) return '已完成全部信号点巡视'
  if (gameState.value.inspected === gameState.value.total) {
    return `返抵终点站台 · ${Math.round(gameState.value.nearestDistance)} m`
  }
  return `${gameState.value.nearestLabel} · ${Math.round(gameState.value.nearestDistance)} m`
})

const editorObjectiveText = computed(() => {
  if (selectedObject.value) return `已选中 ${selectedObject.value.name}`
  return '从右侧模型库点击或拖拽模型到场景'
})

onMounted(() => {
  gameApi.value = createRailwayGame({
    canvas: canvasRef.value,
    host: stageRef.value,
    onState: (nextState) => {
      gameState.value = nextState
    },
    onSignals: (nextSignals) => {
      signals.value = nextSignals
    },
    onEvent: handleGameEvent
  })
  gameApi.value.setEditorMode(editorMode.value)
  if (props.sceneId) {
    loadSavedScene(props.sceneId)
  }
  window.addEventListener('keydown', onEditorShortcut)
})

onBeforeUnmount(() => {
  gameApi.value?.dispose()
  window.clearTimeout(toastTimer)
  window.removeEventListener('keydown', onEditorShortcut)
})

function switchMode(mode) {
  if (props.role === 'student' && mode === 'editor') return
  editorMode.value = mode === 'editor'
  gameApi.value?.setEditorMode(editorMode.value)
}

async function addModel(catalogKey) {
  switchMode('editor')
  await gameApi.value?.addCatalogObject(catalogKey)
}

function dragModel(event, catalogKey) {
  event.dataTransfer?.setData('application/x-railway-model', catalogKey)
  event.dataTransfer?.setData('text/plain', catalogKey)
}

async function dropModel(event) {
  if (!editorMode.value) return
  const catalogKey = event.dataTransfer?.getData('application/x-railway-model') || event.dataTransfer?.getData('text/plain')
  if (!catalogKey) return
  await gameApi.value?.addCatalogObject(catalogKey, {
    clientX: event.clientX,
    clientY: event.clientY
  })
}

function moveSelected(dx, dz) {
  gameApi.value?.moveSelectedObject(dx, dz)
}

function rotateSelected(angle) {
  gameApi.value?.rotateSelectedObject(angle)
}

function rotateSelectedByStep(direction) {
  const degrees = Number(rotationStep.value)
  const safeDegrees = Number.isFinite(degrees) ? Math.min(360, Math.max(0.1, degrees)) : 15
  rotationStep.value = safeDegrees
  rotateSelected(THREE_DEGREES * safeDegrees * direction)
}

function setTransformAxis(group, axis, value) {
  if (!selectedObject.value) return
  const number = Number(value)
  if (!Number.isFinite(number)) return
  gameApi.value?.setSelectedObjectTransform({
    [group]: {
      ...selectedObject.value[group],
      [axis]: number
    }
  })
}

function setRotationAxis(axis, value) {
  if (!selectedObject.value) return
  const degrees = Number(value)
  if (!Number.isFinite(degrees)) return
  gameApi.value?.setSelectedObjectTransform({
    rotation: {
      ...selectedObject.value.rotation,
      [axis]: degrees * THREE_DEGREES
    }
  })
}

function formatNumber(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function formatDegrees(value) {
  return Math.round((Number(value || 0) / THREE_DEGREES) * 10) / 10
}

function deleteSelected() {
  gameApi.value?.deleteSelectedObject()
}

function updateSelectedObject(config) {
  gameApi.value?.updateSelectedObjectConfig(config)
}

function updateSelectedTask(task) {
  gameApi.value?.updateSelectedObjectConfig({
    inspectionPoint: true,
    interactive: true,
    task
  })
}

function clearScene() {
  if (sceneObjects.value.length === 0) return
  if (!window.confirm('确认清空当前布置的模型吗？')) return
  gameApi.value?.clearEditableObjects()
}

function saveScene() {
  const objects = gameApi.value?.exportEditableObjects() || []
  const name = sceneForm.value.name || '铁道信号巡检训练场景'
  if (!name) return
  if (sceneForm.value.published && !objects.some((object) => object.inspectionPoint)) {
    showToast({ type: 'warning', message: '发布给学生前至少设置一个巡检点' })
    return
  }
  const scene = serializeTrainingScene(name, objects, sceneForm.value)
  saveTrainingScene({
    name,
    description: scene.metadata.description,
    difficulty: scene.metadata.difficulty,
    estimatedMinutes: scene.metadata.estimatedMinutes,
    published: scene.published,
    objects: scene.objects,
    tasks: scene.tasks,
    payload: scene
  }).then(() => {
    showToast({ type: 'complete', message: scene.published ? '场景已发布到学生任务库' : '场景草稿已保存' })
  })
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'railway-signal-training-scene.json'
  link.click()
  URL.revokeObjectURL(url)
  showToast({ type: 'complete', message: '场景 JSON 已生成' })
}

async function loadScene(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const scene = parseTrainingScene(text)
    switchMode('editor')
    applySceneForm(scene)
    await gameApi.value?.importEditableObjects(scene.objects)
    showToast({ type: 'complete', message: `已加载 ${scene.objects.length} 个模型` })
  } catch (error) {
    showToast({ type: 'warning', message: error?.message || '场景文件加载失败' })
  }
}

async function loadSavedScene(sceneId) {
  const scene = await getTrainingScene(sceneId)
  if (!scene) {
    showToast({ type: 'warning', message: '未找到该训练场景' })
    return
  }
  applySceneForm(scene.payload || scene)
  await gameApi.value?.importEditableObjects(scene.objects || scene.payload?.objects || [])
  switchMode('train')
  showToast({ type: 'complete', message: `已加载任务：${scene.name}` })
}

function applySceneForm(scene) {
  sceneForm.value = {
    name: scene.sceneName || scene.name || '铁道信号巡检训练场景',
    description: scene.metadata?.description || scene.description || '',
    difficulty: scene.metadata?.difficulty || scene.difficulty || 'normal',
    estimatedMinutes: scene.metadata?.estimatedMinutes || scene.estimatedMinutes || 10,
    published: Boolean(scene.published)
  }
}

function startGame() {
  switchMode('train')
  gameApi.value?.start()
}

function pauseGame() {
  gameApi.value?.pause()
}

function resetGame() {
  gameApi.value?.reset()
}

function toggleAudio() {
  gameApi.value?.setAudioEnabled(!gameState.value.audioEnabled)
}

function press(name) {
  gameApi.value?.setVirtualInput(name, true)
}

function release(name) {
  gameApi.value?.setVirtualInput(name, false)
}

function handleGameEvent(event) {
  if (event.type === 'editor') {
    sceneObjects.value = event.objects || []
    selectedObjectId.value = event.selectedId || null
    return
  }
  showToast(event)
}

function showToast(event) {
  toast.value = event
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 2200)
}

function onEditorShortcut(event) {
  if (!editorMode.value || !isTeacher.value) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
    event.preventDefault()
    saveScene()
    return
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const modes = { KeyG: 'move', KeyR: 'rotate', KeyS: 'scale' }
    if (modes[event.code]) {
      event.preventDefault()
      transformMode.value = modes[event.code]
      return
    }
  }

  if (event.code === 'Escape') {
    transformMode.value = 'move'
    return
  }

  const moveStep = 2
  const heightStep = 0.5
  const scaleUp = 1.05
  let actions = {
    Delete: deleteSelected,
    Backspace: deleteSelected
  }

  if (event.shiftKey) {
    actions = {
      ...actions,
      ArrowUp: () => gameApi.value?.moveSelectedObject(0, 0, heightStep),
      ArrowDown: () => gameApi.value?.moveSelectedObject(0, 0, -heightStep)
    }
  } else if (transformMode.value === 'rotate') {
    actions = {
      ...actions,
      ArrowLeft: () => rotateSelectedByStep(-1),
      ArrowRight: () => rotateSelectedByStep(1)
    }
  } else if (transformMode.value === 'scale') {
    actions = {
      ...actions,
      ArrowUp: () => gameApi.value?.scaleSelectedObject(scaleUp),
      ArrowRight: () => gameApi.value?.scaleSelectedObject(scaleUp),
      ArrowDown: () => gameApi.value?.scaleSelectedObject(1 / scaleUp),
      ArrowLeft: () => gameApi.value?.scaleSelectedObject(1 / scaleUp)
    }
  } else {
    actions = {
      ...actions,
      ArrowUp: () => moveSelected(0, -moveStep),
      ArrowDown: () => moveSelected(0, moveStep),
      ArrowLeft: () => moveSelected(-moveStep, 0),
      ArrowRight: () => moveSelected(moveStep, 0)
    }
  }

  const action = actions[event.code]
  if (!action) return
  event.preventDefault()
  action()
}

const THREE_DEGREES = Math.PI / 180
</script>
