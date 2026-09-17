import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { config } from '../config.js'
import { listTags, listRunning } from './ollamaService.js'
import { logger } from '../utils/logger.js'

/**
 * 本地模型发现。
 *
 * 为什么需要三级回退：Ollama 以 systemd 服务用户运行时，它的模型目录来自**服务端**的
 * HOME（本机是 /usr/share/ollama/.ollama/models），而不是当前进程的 ~/.ollama。
 * 所以「读 OLLAMA_MODELS 环境变量」单独用会拿到空列表。三级来源分别是：
 *   A. /api/tags —— 权威，反映 Ollama 进程实际加载的模型
 *   B. 文件系统清单目录 —— 兜底，Ollama 没起来时也能列出模型
 *   C. systemd 单元解析 —— 捕捉「服务端设了自定义目录而我们的进程看不到」的情况
 */

// systemd 的 User=ollama 默认家目录。本机唯一有实际内容的路径。
const SYSTEM_OLLAMA_HOME = '/usr/share/ollama'
const DEFAULT_MANIFEST_SUFFIX = join('.ollama', 'models', 'manifests')
const OFFICIAL_REGISTRY = 'registry.ollama.ai'

// embedding 模型不该出现在对话下拉框里。
const EMBEDDING_HINTS = ['embed', 'bge-', 'bge_', 'nomic', 'mxbai', 'minilm', 'e5-', 'gte-', 'jina']

let cache = { at: 0, data: null, inflight: null }

function isEmbeddingName(name) {
  const lower = name.toLowerCase()
  return EMBEDDING_HINTS.some((hint) => lower.includes(hint))
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit <= 1 ? 0 : 1)} ${units[unit]}`
}

/** 解析 systemd 单元与 drop-in 里的 OLLAMA_MODELS。只读文件，不调 shell。 */
async function readSystemdModelsDir() {
  const candidates = ['/etc/systemd/system/ollama.service']
  try {
    const dropInDir = '/etc/systemd/system/ollama.service.d'
    const entries = await readdir(dropInDir)
    for (const entry of entries) {
      if (entry.endsWith('.conf')) candidates.push(join(dropInDir, entry))
    }
  } catch {
    // 没有 drop-in 目录是正常情况。
  }

  const envStyles = /\bOLLAMA_MODELS\s*=\s*"?([^"\s]+)"?/g

  for (const file of candidates) {
    try {
      const text = await readFile(file, 'utf8')
      let match = envStyles.exec(text)
      while (match !== null) {
        const value = match[1]
        if (value.startsWith('/')) return value
        match = envStyles.exec(text)
      }
      envStyles.lastIndex = 0
    } catch {
      // 文件不存在或无权读取，继续尝试下一个。
    }
  }
  return null
}

/** 汇总所有可能的模型根目录（每个根目录下的 manifests 才是清单所在）。 */
async function candidateManifestRoots() {
  const roots = []

  const push = (modelsDir, label) => {
    if (!modelsDir) return
    const manifestDir = resolve(modelsDir, 'manifests')
    if (!roots.some((item) => item.dir === manifestDir)) {
      roots.push({ dir: manifestDir, modelsDir: resolve(modelsDir), label })
    }
  }

  // 1. 本进程的 OLLAMA_MODELS
  push(process.env.OLLAMA_MODELS, 'env:OLLAMA_MODELS')

  // 2. 显式覆盖的逃生口，冒号分隔支持多个
  for (const dir of String(process.env.OLLAMA_MODELS_DIRS ?? '').split(':').map((s) => s.trim()).filter(Boolean)) {
    push(dir, 'env:OLLAMA_MODELS_DIRS')
  }

  // 3. systemd 服务端配置
  push(await readSystemdModelsDir(), 'systemd')

  // 4. 当前进程家目录的官方默认值
  push(join(homedir(), '.ollama', 'models'), 'home')

  // 5. systemd 服务用户的家目录（本机实际生效的那个）
  push(join(SYSTEM_OLLAMA_HOME, DEFAULT_MANIFEST_SUFFIX.replace(/\/manifests$/, '')), 'system-user')
  push(join(SYSTEM_OLLAMA_HOME, '.ollama', 'models'), 'system-user')

  return roots
}

/** 把 manifest 路径还原成模型名：<registry>/<namespace>/<model>/<tag> */
function manifestPathToName(relativePath) {
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length < 3) return null

  const [registry, ...rest] = parts

  if (rest.length >= 3) {
    const tag = rest[rest.length - 1]
    const model = rest.slice(1, -1).join('/')
    const namespace = rest[0]
    if (namespace === 'library') return `${model}:${tag}`
    return `${namespace}/${model}:${tag}`
  }

  if (rest.length === 2) {
    // 无 tag 的单层形式，Ollama 默认补 :latest
    const [namespace, model] = rest
    if (namespace === 'library') return `${model}:latest`
    return `${namespace}/${model}:latest`
  }

  // rest.length === 1：<registry>/<model>
  if (registry !== OFFICIAL_REGISTRY) return `${registry}/${rest[0]}:latest`
  return `${rest[0]}:latest`
}

/** 读取 manifest 汇总模型体积（与 /api/tags 报的数一致）。 */
async function readManifestSize(file) {
  try {
    const text = await readFile(file, 'utf8')
    const manifest = JSON.parse(text)
    const layers = Array.isArray(manifest.layers) ? manifest.layers : []
    const total = layers
      .filter((layer) => String(layer.mediaType ?? '').includes('image.model'))
      .reduce((sum, layer) => sum + (Number(layer.size) || 0), 0)
    if (total > 0) return total
    // 没有 model 层就退而求其次，把配置层之外的体积也计入，总比显示空白好。
    return layers.reduce((sum, layer) => sum + (Number(layer.size) || 0), 0)
  } catch {
    return 0
  }
}

/** 递归扫描一个 manifests 根目录，收集所有模型。 */
async function scanManifestRoot(root) {
  const found = []

  async function walk(dir, depth) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < 4) await walk(full, depth + 1)
      } else if (entry.isFile()) {
        const relative = full.slice(root.dir.length + 1)
        const name = manifestPathToName(relative)
        if (!name) continue
        const info = await stat(full).catch(() => null)
        found.push({
          name,
          size: await readManifestSize(full),
          modifiedAt: info?.mtime?.toISOString() ?? null,
        })
      }
    }
  }

  await walk(root.dir, 0)
  return found
}

/** 来源 B：文件系统扫描。 */
async function collectFromDisk() {
  const roots = await candidateManifestRoots()
  const byName = new Map()
  const scannedRoots = []

  for (const root of roots) {
    const info = await stat(root.dir).catch(() => null)
    if (!info?.isDirectory()) continue

    const items = await scanManifestRoot(root)
    if (items.length === 0) continue

    scannedRoots.push({ modelsDir: root.modelsDir, label: root.label, count: items.length })
    for (const item of items) {
      const existing = byName.get(item.name)
      if (existing) {
        if (!existing.size && item.size) existing.size = item.size
        continue
      }
      byName.set(item.name, {
        ...item,
        modelsDir: root.modelsDir,
        sourceLabel: root.label,
      })
    }
  }

  return { models: [...byName.values()], scannedRoots }
}

/** 来源 A：Ollama HTTP 接口。/api/tags 返回的是 { models: [...] } 包装对象。 */
async function collectFromApi() {
  try {
    const tags = await listTags()
    const models = Array.isArray(tags) ? tags : Array.isArray(tags?.models) ? tags.models : []
    return { ok: true, models }
  } catch (error) {
    return { ok: false, error: error.message, models: [] }
  }
}

function normalizeApiModel(entry) {
  const details = entry.details ?? {}
  return {
    name: entry.name ?? entry.model,
    size: Number(entry.size) || 0,
    digest: entry.digest ?? '',
    modifiedAt: entry.modified_at ?? null,
    parameterSize: details.parameter_size ?? '',
    quantization: details.quantization_level ?? '',
    family: details.family ?? '',
  }
}

/**
 * 合并两个来源。
 * 关键原则：以 /api/tags 为准，磁盘上有而 Ollama 不认的条目标注出来而不是静默混入，
 * 否则用户选了却加载失败，不知道为什么。
 */
function reconcile(apiModels, diskModels, apiOk) {
  const merged = new Map()

  for (const raw of apiModels) {
    const model = normalizeApiModel(raw)
    if (!model.name) continue
    merged.set(model.name, {
      ...model,
      source: 'api',
    })
  }

  for (const disk of diskModels) {
    const existing = merged.get(disk.name)
    if (existing) {
      existing.source = 'both'
      if (!existing.size && disk.size) existing.size = disk.size
      existing.onDisk = true
      continue
    }
    merged.set(disk.name, {
      name: disk.name,
      size: disk.size,
      digest: '',
      modifiedAt: disk.modifiedAt,
      parameterSize: '',
      quantization: '',
      family: '',
      source: 'dir',
      onDisk: true,
      onDiskDir: disk.modelsDir,
      sourceLabel: disk.sourceLabel,
      available: false,
      reason: apiOk ? 'foreign_dir' : 'ollama_unreachable',
    })
  }

  return [...merged.values()].map((model) => {
    const isEmbedding = isEmbeddingName(model.name)
    const available = model.available === false ? false : true
    return {
      ...model,
      available,
      isEmbedding,
      sizeText: formatSize(model.size),
      capabilities: isEmbedding ? ['embedding'] : ['chat'],
      // 磁盘上有但 Ollama 未加载：给出可操作的修复提示。
      hint:
        model.reason === 'foreign_dir'
          ? `该模型位于 ${model.onDiskDir}，但 Ollama 服务当前未加载它。设置 OLLAMA_MODELS 指向该目录并重启 ollama 服务后即可选用。`
          : model.reason === 'ollama_unreachable'
            ? 'Ollama 服务当前不可用，无法加载该模型。'
            : '',
    }
  })
}

function applyFilters(models) {
  const { allowlist, denylist } = config.ollama
  return models.filter((model) => {
    if (allowlist.length > 0 && !allowlist.includes(model.name)) return false
    if (denylist.includes(model.name)) return false
    return true
  })
}

async function build() {
  const [api, disk] = await Promise.all([collectFromApi(), collectFromDisk()])
  const models = applyFilters(reconcile(api.models, disk.models, api.ok))

  // 标记正在显存里的模型，前端可以显示「已加载」徽标与显存占用。
  let running = []
  try {
    running = await listRunning()
  } catch {
    running = []
  }
  const runningByName = new Map(running.map((item) => [item.name, item]))
  for (const model of models) {
    const live = runningByName.get(model.name)
    model.running = Boolean(live)
    model.vramBytes = live?.sizeVram ?? 0
    model.vramText = live?.sizeVram ? formatSize(live.sizeVram) : ''
    model.contextLength = live?.contextLength ?? null
  }

  // chat 模型优先；默认模型取配置值，配置值不合法时退回第一个可用的 chat 模型。
  const chatModels = models.filter((model) => !model.isEmbedding && model.available)
  const configuredDefault = config.ollama.defaultModel
  const defaultModel = chatModels.some((model) => model.name === configuredDefault)
    ? configuredDefault
    : (chatModels.find((model) => model.running)?.name ?? chatModels[0]?.name ?? '')

  if (!api.ok) {
    logger.warn('Ollama 接口不可用，模型列表仅来自磁盘扫描', { error: api.error })
  }

  return {
    models,
    chatModels: chatModels.map((model) => model.name),
    defaultModel,
    ollama: {
      reachable: api.ok,
      error: api.ok ? '' : api.error,
      baseUrl: config.ollama.baseUrl,
    },
    sources: {
      api: api.ok ? api.models.length : 0,
      disk: disk.models.length,
      roots: disk.scannedRoots,
      envModelsDir: process.env.OLLAMA_MODELS ?? '',
    },
    generatedAt: new Date().toISOString(),
  }
}

/** 取模型清单，带 30 秒缓存。refresh 为真时强制刷新。 */
export async function getModelRegistry({ refresh = false } = {}) {
  const now = Date.now()
  if (!refresh && cache.data && now - cache.at < config.ollama.modelCacheTtlMs) {
    return cache.data
  }
  // 并发请求共用同一次构建，避免同时打爆 Ollama。
  if (cache.inflight) return cache.inflight

  cache.inflight = build()
    .then((data) => {
      cache = { at: Date.now(), data, inflight: null }
      return data
    })
    .catch((error) => {
      cache.inflight = null
      throw error
    })

  return cache.inflight
}

export function invalidateModelCache() {
  cache = { at: 0, data: null, inflight: null }
}

export { formatSize, isEmbeddingName }
