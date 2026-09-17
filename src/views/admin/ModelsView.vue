<script setup>
/**
 * 模型管理。
 *
 * 模型清单不是分页的——它是「本机已下载模型的枚举」，天然是个短列表（本机 2 个），
 * 分页反而会把唯一一个能用的模型藏到第二页。这里改用卡片网格 + 搜索过滤，
 * 菜单的其余八个列表全部走分页。
 *
 * 三个来源标签的含义（来自 modelRegistry）：
 * - both / api：Ollama 认得，可以正常选用
 * - dir：磁盘上有但 Ollama 当前没加载，卡片置灰并给出修复提示
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { Download, HardDrive, RefreshCw, Search, Trash2, Upload } from '@lucide/vue'
import { aiApi } from '../../api/ai'
import { adminApi } from '../../api/admin'
import { formatBytes, textOr } from '../../api/format'

const models = ref([])
const defaultModel = ref('')
const loading = ref(false)
const error = ref('')
const notice = ref(null)
const busyName = ref('')
const keyword = ref('')

const load = async (refresh = false) => {
  loading.value = true
  error.value = ''
  try {
    const data = await aiApi.models(refresh)
    models.value = data.models ?? []
    defaultModel.value = data.defaultModel ?? ''
  } catch (err) {
    error.value = err?.message || '模型列表加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => load(false))

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return models.value
  return models.value.filter((model) => model.name.toLowerCase().includes(q))
})

const SOURCE_LABELS = {
  api: 'Ollama 已加载',
  dir: '仅磁盘',
  both: '磁盘 + Ollama',
}

async function refresh() {
  notice.value = null
  await load(true)
  notice.value = { tone: 'ok', text: '模型列表已刷新' }
}

async function run(model, task, successText) {
  busyName.value = model.name
  notice.value = null
  try {
    await task()
    notice.value = { tone: 'ok', text: successText }
    await load(true)
  } catch (err) {
    notice.value = { tone: 'error', text: err?.message || '操作失败' }
  } finally {
    busyName.value = ''
  }
}

function loadModel(model) {
  return run(model, () => aiApi.loadModel(model.name), `${model.name} 已加载到显存`)
}

function unloadModel(model) {
  return run(model, () => aiApi.unloadModel(model.name), `${model.name} 已从显存卸载`)
}

async function removeModel(model) {
  const ok = window.confirm(`确定删除模型 ${model.name} 吗？磁盘文件会被移除，需要重新下载才能使用。`)
  if (!ok) return
  await run(model, () => aiApi.deleteModel(model.name), `${model.name} 已删除`)
}

/* ------------------------------- 拉取新模型 ------------------------------- */

const pull = reactive({ name: '', running: false, status: '', percent: 0, error: '' })
let pullHandle = null

function startPull() {
  const name = pull.name.trim()
  if (!name || pull.running) return
  pull.running = true
  pull.status = '正在连接模型仓库…'
  pull.percent = 0
  pull.error = ''
  notice.value = null

  pullHandle = aiApi.pullModel(name, {
    onFrame: (frame) => {
      // Ollama 的进度帧形如 {status, digest, total, completed}
      if (frame?.status) pull.status = frame.status
      if (frame?.total) pull.percent = Math.round(((frame.completed ?? 0) / frame.total) * 100)
    },
    onControl: (type, payload) => {
      if (type === 'done') {
        pull.running = false
        pull.status = '拉取完成'
        notice.value = { tone: 'ok', text: `模型 ${name} 拉取完成` }
        load(true)
      } else if (type === 'error') {
        pull.running = false
        pull.error = payload?.message || '拉取失败'
      }
    },
    onError: (err) => {
      pull.running = false
      pull.error = err?.message || '拉取失败'
    },
  })
}

function cancelPull() {
  pullHandle?.stop()
  pull.running = false
  pull.status = '已取消'
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">模型管理</h1>
      <button class="btn-ghost" type="button" :disabled="loading" @click="refresh">
        <RefreshCw :size="15" /> 刷新
      </button>
    </header>

    <div class="filter-bar">
      <label class="filter-item">
        <Search :size="15" />
        <input v-model="keyword" type="search" placeholder="搜索模型名" />
      </label>
      <span class="filter-hint">
        共 {{ models.length }} 个模型，默认模型：<strong>{{ textOr(defaultModel) }}</strong>
      </span>
    </div>

    <p v-if="notice" class="notice" :class="notice.tone">{{ notice.text }}</p>
    <p v-if="error" class="form-error">{{ error }}</p>

    <section class="panel">
      <h2>本机模型</h2>
      <p v-if="loading" class="panel-hint">正在读取模型清单…</p>
      <p v-else-if="filtered.length === 0" class="panel-hint">没有匹配的模型</p>

      <div v-else class="model-grid">
        <article
          v-for="model in filtered"
          :key="model.name"
          class="model-card"
          :class="{ unavailable: !model.available }"
        >
          <header>
            <strong>{{ model.name }}</strong>
            <span v-if="model.running" class="tag status-active">已加载</span>
            <span v-if="model.isEmbedding" class="tag">向量模型</span>
          </header>

          <dl>
            <div><dt>体积</dt><dd>{{ model.sizeText || formatBytes(model.size) }}</dd></div>
            <div><dt>参数量</dt><dd>{{ textOr(model.parameterSize) }}</dd></div>
            <div><dt>量化</dt><dd>{{ textOr(model.quantization) }}</dd></div>
            <div><dt>显存</dt><dd>{{ textOr(model.vramText, '未加载') }}</dd></div>
            <div><dt>来源</dt><dd>{{ SOURCE_LABELS[model.source] || model.source }}</dd></div>
          </dl>

          <p v-if="model.hint" class="model-hint">{{ model.hint }}</p>

          <footer>
            <button
              v-if="!model.running"
              class="link-btn"
              type="button"
              :disabled="busyName === model.name || !model.available"
              @click="loadModel(model)"
            >
              <Upload :size="14" /> 加载
            </button>
            <button
              v-else
              class="link-btn"
              type="button"
              :disabled="busyName === model.name"
              @click="unloadModel(model)"
            >
              <Download :size="14" /> 卸载
            </button>

            <button
              class="link-btn danger"
              type="button"
              :disabled="busyName === model.name"
              @click="removeModel(model)"
            >
              <Trash2 :size="14" /> 删除
            </button>
          </footer>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2>拉取新模型</h2>
      <p class="panel-hint">
        从模型仓库下载新模型到本机。下载地址由 Ollama 配置决定；若网络不可达，
        这里会显示具体错误，已下载的模型不受影响。
      </p>

      <div class="filter-bar">
        <label class="filter-item grow">
          <HardDrive :size="15" />
          <input v-model="pull.name" placeholder="模型名，如 qwen2.5:7b" :disabled="pull.running" />
        </label>
        <button v-if="!pull.running" class="btn-primary" type="button" @click="startPull">开始拉取</button>
        <button v-else class="btn-ghost" type="button" @click="cancelPull">取消</button>
      </div>

      <div v-if="pull.running || pull.status" class="pull-progress">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${pull.percent}%` }" />
        </div>
        <span>{{ pull.status }}<template v-if="pull.percent"> · {{ pull.percent }}%</template></span>
      </div>

      <p v-if="pull.error" class="form-error">{{ pull.error }}</p>
    </section>
  </div>
</template>
