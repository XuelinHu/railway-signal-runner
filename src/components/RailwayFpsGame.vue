<template>
  <main class="app-shell">
    <section ref="stageRef" class="game-stage">
      <canvas ref="canvasRef" class="game-canvas"></canvas>

      <header class="topbar">
        <div class="brand-block">
          <div class="brand-mark"></div>
          <div class="brand-copy">
            <strong>Railway Signal Runner</strong>
            <span>铁道信号第一人称巡视</span>
          </div>
        </div>

        <div class="action-group">
          <button
            v-if="!gameState.running"
            class="tool-button primary"
            type="button"
            title="开始"
            :disabled="!gameState.ready || gameState.completed"
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
          <button class="icon-button" type="button" :title="mapVisible ? '隐藏地图' : '显示地图'" @click="mapVisible = !mapVisible">
            <MapPinned v-if="mapVisible" :size="19" />
            <Map v-else :size="19" />
          </button>
          <button class="icon-button" type="button" :title="gameState.audioEnabled ? '关闭音效' : '开启音效'" @click="toggleAudio">
            <Volume2 v-if="gameState.audioEnabled" :size="19" />
            <VolumeX v-else :size="19" />
          </button>
        </div>
      </header>

      <div class="crosshair" aria-hidden="true"></div>

      <section class="metric-strip" aria-label="巡视状态">
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
          <span>{{ gameState.health }}%</span>
        </div>
      </section>

      <aside class="mission-panel">
        <div class="panel-heading">
          <span>巡视目标</span>
          <strong>{{ gameState.inspected }}/{{ gameState.total }}</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${completionRatio}%` }"></div>
        </div>
        <div class="target-list">
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
        </div>
      </aside>

      <section class="objective-dock">
        <div>
          <span class="objective-label">{{ gameState.phase }}</span>
          <strong>{{ objectiveText }}</strong>
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

      <div v-else-if="!gameState.running && !gameState.completed" class="center-panel start-panel">
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
          <span>再次巡视</span>
        </button>
      </div>

      <div v-if="toast" class="toast" :class="`toast-${toast.type}`">
        {{ toast.message }}
      </div>

      <nav class="mobile-controls" aria-label="移动控制">
        <button type="button" title="左移" @pointerdown="press('left')" @pointerup="release('left')" @pointerleave="release('left')">
          <ChevronLeft :size="21" />
        </button>
        <button type="button" title="前进" @pointerdown="press('forward')" @pointerup="release('forward')" @pointerleave="release('forward')">
          <ChevronUp :size="21" />
        </button>
        <button type="button" title="后退" @pointerdown="press('backward')" @pointerup="release('backward')" @pointerleave="release('backward')">
          <ChevronDown :size="21" />
        </button>
        <button type="button" title="右移" @pointerdown="press('right')" @pointerup="release('right')" @pointerleave="release('right')">
          <ChevronRight :size="21" />
        </button>
        <button type="button" title="左转" @pointerdown="press('turnLeft')" @pointerup="release('turnLeft')" @pointerleave="release('turnLeft')">
          <RotateCcw :size="18" />
        </button>
        <button type="button" title="右转" @pointerdown="press('turnRight')" @pointerup="release('turnRight')" @pointerleave="release('turnRight')">
          <RotateCw :size="18" />
        </button>
      </nav>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Flag,
  Gauge,
  LoaderCircle,
  Map,
  MapPinned,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Route,
  ShieldCheck,
  Volume2,
  VolumeX
} from '@lucide/vue'
import CesiumMiniMap from './CesiumMiniMap.vue'
import { createRailwayGame, SIGNAL_POINTS, worldToGeo } from '../game/railwayGame'

const canvasRef = ref(null)
const stageRef = ref(null)
const mapVisible = ref(true)
const gameApi = ref(null)
const toast = ref(null)
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
    onEvent: showToast
  })
})

onBeforeUnmount(() => {
  gameApi.value?.dispose()
  window.clearTimeout(toastTimer)
})

function startGame() {
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

function showToast(event) {
  toast.value = event
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 2200)
}
</script>
