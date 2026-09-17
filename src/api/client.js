/**
 * HTTP 客户端。基于原生 fetch，不引 axios。
 *
 * 三件事：
 * 1. 统一带 Bearer 头、统一把后端的 {ok,code,message} 错误转成 ApiError。
 * 2. access token 过期（401）时自动刷新一次并重放原请求。
 *    并发请求同时 401 时共用一个刷新 Promise，否则会连发多次刷新，
 *    而刷新令牌是轮换 + 重放检测的，并发刷新会被判为重放并吊销整个令牌家族。
 * 3. 完全同源：base 固定 /api，dev 与 preview 都走 Vite 代理。
 */
import { clearSession, getAccessToken, getRefreshToken, saveSession } from './tokenStore'

const BASE = '/api'

/** 认证失效时通知外部（auth store 监听后跳登录页）。 */
const authFailureListeners = new Set()

export function onAuthFailure(listener) {
  authFailureListeners.add(listener)
  return () => authFailureListeners.delete(listener)
}

function emitAuthFailure(reason) {
  for (const listener of authFailureListeners) {
    try {
      listener(reason)
    } catch {
      /* 单个监听器出错不影响其它监听器 */
    }
  }
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || '请求失败')
    this.name = 'ApiError'
    this.status = status
    this.code = code || 'unknown'
    this.details = details
  }

  /** 网络层失败（断网、后端没起）与业务错误区分开，便于给不同的提示文案。 */
  get isNetworkError() {
    return this.status === 0
  }
}

function buildUrl(path, query) {
  const url = `${BASE}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.append(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function parseBody(response) {
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) {
    const text = await response.text().catch(() => '')
    return text ? { message: text } : {}
  }
  return response.json().catch(() => ({}))
}

/** 裸请求：不带令牌、不自动刷新，供刷新接口自身与流式连接复用。 */
async function rawFetch(method, path, { body, query, token, signal, headers } = {}) {
  const init = {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal,
  }
  if (body !== undefined) init.body = JSON.stringify(body)

  try {
    return await fetch(buildUrl(path, query), init)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(0, 'network_error', '无法连接服务器，请检查网络或稍后重试')
  }
}

// 刷新进行中的 Promise。并发 401 共用它，避免同一次会话发出多个刷新请求。
let refreshPromise = null

async function refreshSession() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await rawFetch('POST', '/auth/refresh', { body: { refreshToken } })
        const data = await parseBody(response)
        if (!response.ok || !data.ok) return false
        saveSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        })
        return true
      } catch {
        return false
      } finally {
        // 清空要放在微任务之后，让同一轮并发请求都能复用到这个 Promise。
        setTimeout(() => {
          refreshPromise = null
        }, 0)
      }
    })()
  }

  return refreshPromise
}

/**
 * 发起请求。401 时自动刷新一次并重放。
 * @param {object} options
 * @param {boolean} [options.skipAuth] 不带令牌（登录、注册等公开接口）
 * @param {boolean} [options.skipRefresh] 401 时不尝试刷新（刷新接口自身用）
 */
export async function request(method, path, options = {}) {
  const { skipAuth = false, skipRefresh = false, ...rest } = options

  const send = (token) => rawFetch(method, path, { ...rest, token: skipAuth ? undefined : token })

  let response = await send(getAccessToken())

  if (response.status === 401 && !skipAuth && !skipRefresh && getRefreshToken()) {
    const refreshed = await refreshSession()
    if (refreshed) {
      response = await send(getAccessToken())
    } else {
      clearSession()
      emitAuthFailure('refresh_failed')
    }
  }

  if (response.status === 204) return null

  const data = await parseBody(response)

  if (!response.ok) {
    const error = new ApiError(
      response.status,
      data.code,
      data.message || `请求失败（HTTP ${response.status}）`,
      data.details
    )
    // 401 走到这里说明刷新也没救回来，通知外部回登录页。
    if (response.status === 401 && !skipAuth) emitAuthFailure(error.code || 'unauthorized')
    throw error
  }

  return data
}

export const http = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
}

/**
 * NDJSON 流式请求（智能体对话用）。
 *
 * 不用 EventSource：它既不能带 Authorization 头，也不能发 POST body，
 * 用 JWT 就只能把令牌塞进 query string，那会漏进 FRP 与代理日志。
 * fetch + getReader 支持 Bearer 头、请求体与 AbortController。
 *
 * @returns {Promise<{stop: () => void, done: Promise<void>}>}
 */
export function streamNdjson(path, { body, signal, onFrame, onControl, onError, onOpen } = {}) {
  const controller = new AbortController()
  // 外部传了 signal 就联动，任一中断都能停掉底层连接。
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const done = (async () => {
    let response
    try {
      response = await rawFetch('POST', path, {
        body,
        token: getAccessToken(),
        signal: controller.signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      onError?.(error)
      return
    }

    if (response.status === 401) {
      // 流式请求不做自动刷新重放：重放会丢掉已经选好的对话上下文，
      // 直接让前端提示重新登录更可预期。
      clearSession()
      emitAuthFailure('unauthorized')
      onError?.(new ApiError(401, 'unauthorized', '登录已过期，请重新登录'))
      return
    }

    if (!response.ok || !response.body) {
      const data = await parseBody(response).catch(() => ({}))
      onError?.(new ApiError(response.status, data.code, data.message || '对话请求失败', data.details))
      return
    }

    onOpen?.()

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      for (;;) {
        const { done: finished, value } = await reader.read()
        if (finished) break
        buffer += decoder.decode(value, { stream: true })

        // 帧以换行分隔；最后一段可能是不完整的行，留在 buffer 里等下一块。
        let index = buffer.indexOf('\n')
        while (index !== -1) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (line) {
            try {
              const frame = JSON.parse(line)
              if (frame.__railway) onControl?.(frame.__railway, frame)
              else onFrame?.(frame)
            } catch {
              /* 半行或坏帧直接跳过，不能让一帧毁掉整个流 */
            }
          }
          index = buffer.indexOf('\n')
        }
      }
      // 收尾：服务端若没以换行结束，最后一行仍在 buffer 里。
      const tail = buffer.trim()
      if (tail) {
        try {
          const frame = JSON.parse(tail)
          if (frame.__railway) onControl?.(frame.__railway, frame)
          else onFrame?.(frame)
        } catch {
          /* 忽略 */
        }
      }
    } catch (error) {
      if (error?.name !== 'AbortError') onError?.(error)
    } finally {
      reader.cancel().catch(() => {})
    }
  })()

  return { stop: () => controller.abort(), done }
}
