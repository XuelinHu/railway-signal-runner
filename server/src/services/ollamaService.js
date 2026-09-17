import { config } from '../config.js'
import { badGateway, serviceUnavailable } from '../utils/httpError.js'

/**
 * Ollama 调用封装。
 *
 * 两个必须守住的前提：
 * 1. 绝对不能带 Origin 头。Ollama 0.19 会对带 Origin 的请求直接返回 403
 *    （实测：不带 200，带 http://47.120.48.245:14029 返回 403）。
 *    Node 的 fetch 默认不发 Origin，所以这里保持默认即可，切勿手工添加。
 * 2. 上游错误要转成中文业务错误，不能把 Ollama 的原始报错透给前端。
 */

const base = () => config.ollama.baseUrl

function timeoutSignal(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}

async function request(path, { method = 'GET', body, timeoutMs } = {}) {
  const { signal, cancel } = timeoutSignal(timeoutMs ?? config.ollama.requestTimeoutMs)
  try {
    const response = await fetch(`${base()}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw badGateway(describeUpstreamError(response.status, text), 'ollama_error')
    }

    const text = await response.text()
    return text ? JSON.parse(text) : null
  } catch (error) {
    if (error.name === 'AbortError') {
      throw serviceUnavailable('模型服务响应超时，请稍后重试', 'ollama_timeout')
    }
    if (error.status) throw error
    throw serviceUnavailable(
      `无法连接模型服务（${base()}），请确认 Ollama 是否已启动`,
      'ollama_unreachable'
    )
  } finally {
    cancel()
  }
}

function describeUpstreamError(status, text) {
  if (status === 404) return '模型不存在，请先在模型管理中下载'
  const snippet = text.slice(0, 200)
  return `模型服务返回错误（${status}）${snippet ? `：${snippet}` : ''}`
}

/** 已下载的模型清单。这是模型发现的权威来源。 */
export function listTags() {
  return request('/api/tags', { timeoutMs: 10_000 })
}

/** 当前加载在显存/内存里的模型。 */
export async function listRunning() {
  const data = await request('/api/ps', { timeoutMs: 10_000 })
  const models = Array.isArray(data?.models) ? data.models : []
  return models.map((item) => ({
    name: item.name ?? item.model,
    size: Number(item.size) || 0,
    sizeVram: Number(item.size_vram) || 0,
    contextLength: item.context_length ?? null,
    expiresAt: item.expires_at ?? null,
    parameterSize: item.details?.parameter_size ?? '',
    quantization: item.details?.quantization_level ?? '',
  }))
}

export function showModel(name) {
  return request('/api/show', { method: 'POST', body: { model: name }, timeoutMs: 15_000 })
}

/**
 * 流式对话。返回原始的 fetch Response，由调用方读取 body 并转发。
 * 这里不设总超时——大模型生成长文本可能远超常规请求时长，
 * 中断由客户端断开或显式 stop 来控制。
 */
export async function chatStream({ model, messages, options, keepAlive }) {
  let response
  try {
    response = await fetch(`${base()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        keep_alive: keepAlive ?? config.ollama.keepAlive,
        ...(options ? { options } : {}),
      }),
    })
  } catch (error) {
    throw serviceUnavailable(
      `无法连接模型服务（${base()}），请确认 Ollama 是否已启动`,
      'ollama_unreachable'
    )
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw badGateway(describeUpstreamError(response.status, text), 'ollama_error')
  }

  return response
}

/**
 * 预加载模型到显存。keep_alive 传 -1 表示常驻不卸载。
 * 加载 9GB 级模型需要时间，前端要有「模型加载中」状态。
 */
export async function loadModel(name) {
  return request('/api/generate', {
    method: 'POST',
    body: { model: name, keep_alive: -1, prompt: '' },
    timeoutMs: 300_000,
  })
}

/** 立即卸载，释放显存。 */
export async function unloadModel(name) {
  return request('/api/generate', {
    method: 'POST',
    body: { model: name, keep_alive: 0, prompt: '' },
    timeoutMs: 60_000,
  })
}

export async function deleteModel(name) {
  return request('/api/delete', { method: 'DELETE', body: { model: name }, timeoutMs: 60_000 })
}

/**
 * 拉取模型，返回原始流式 Response 供转发进度。
 * 注意：本机 registry.ollama.ai 实测不可达，该操作会失败，
 * 路由层需要把错误讲清楚（无法连接模型仓库）。
 */
export async function pullModelStream(name) {
  let response
  try {
    response = await fetch(`${base()}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, stream: true }),
    })
  } catch {
    throw serviceUnavailable('无法连接模型服务，请确认 Ollama 是否已启动', 'ollama_unreachable')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw badGateway(describeUpstreamError(response.status, text), 'ollama_error')
  }

  return response
}

export async function healthCheck() {
  try {
    const data = await request('/api/tags', { timeoutMs: 5_000 })
    const models = Array.isArray(data?.models) ? data.models : []
    return { ok: true, modelCount: models.length, baseUrl: base() }
  } catch (error) {
    return { ok: false, error: error.message, baseUrl: base() }
  }
}
