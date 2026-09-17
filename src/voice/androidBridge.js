/**
 * 安卓原生语音桥接（JS 侧）。
 *
 * 安卓壳通过 addJavascriptInterface 注入 `RailwayVoice`（兼容别名 `AndroidVoice`），
 * 原生侧用法与义务见 docs/android-voice-bridge.md。这里的职责只有两件：
 * 1. 探测桥是否存在、是否真的可用；
 * 2. 把 Promise/回调风格的原生回调，翻译成本项目统一的 VoiceSession 接口。
 *
 * 设计约束（决定了下面的写法）：
 * - 每个原生方法只接收【一个 JSON 字符串】参数。@JavascriptInterface 的参数类型编组
 *   很容易踩坑，单参数是最不容易出错的形态。
 * - 原生回调必须回到 WebView 线程，通过 window.RailwayVoiceOn{Result,Error,Event}
 *   三个全局函数派发。因此这里先把它们挂到 window 上，再调原生方法。
 * - 原生回调里的 requestId 必须原样回传；超时兜底放在这一侧，因为原生可能因为
 *   权限弹窗、来电打断等原因永远不回调。
 */

/** 原生侧约定：JS 在 maxDurationMs + 3000 内应收到终态，否则自己 20 秒超时恢复。 */
const LISTEN_TIMEOUT_MS = 20000

const RESULT_FN = 'RailwayVoiceOnResult'
const ERROR_FN = 'RailwayVoiceOnError'
const EVENT_FN = 'RailwayVoiceOnEvent'

function getBridge() {
  if (typeof window === 'undefined') return null
  const bridge = window.RailwayVoice ?? window.AndroidVoice ?? null
  if (!bridge) return null
  return typeof bridge.isAvailable === 'function' && !isTruthy(bridge.isAvailable('{}')) ? null : bridge
}

function isTruthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

export function isAndroidBridgeAvailable() {
  return Boolean(getBridge())
}

/**
 * 读取原生能力。失败或超时都返回 null，由调用方降级到下一档。
 * @returns {Promise<{asr: boolean, tts: boolean, locale: string, supportsPartial: boolean}|null>}
 */
export function probeAndroidCapabilities() {
  const bridge = getBridge()
  if (!bridge) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    // 原生 getCapabilities 是同步返回 JSON 字符串的（契约里这么定），
    // 但为防某些实现做成异步回调，两边都接：先看返回值，再留一个短超时。
    try {
      const raw = bridge.getCapabilities('{}')
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        const parsed = JSON.parse(raw)
        return finish({
          asr: Boolean(parsed.asr),
          tts: Boolean(parsed.tts),
          locale: parsed.locale || 'zh-CN',
          supportsPartial: parsed.supportsPartial !== false,
        })
      }
    } catch {
      /* 走下面的超时兜底 */
    }

    setTimeout(() => finish(null), 800)
  })
}

/**
 * 创建一个桥接会话。调用前请先用 probeAndroidCapabilities 确认可用。
 */
export function createAndroidVoiceSession({ onResult, onEvent } = {}) {
  const bridge = getBridge()
  if (!bridge) return null

  let requestSeq = 0
  let activeRequestId = ''
  let timeoutTimer = null
  let speaking = false

  const nextRequestId = (prefix) => `${prefix}-${Date.now()}-${(requestSeq += 1)}`

  // 原生 → JS 的回调入口。挂在 window 上是契约的一部分，不是偷懒。
  window[RESULT_FN] = (json) => {
    const payload = safeParse(json)
    if (!payload) return
    if (payload.requestId && activeRequestId && payload.requestId !== activeRequestId) return

    if (payload.type === 'partial') {
      onResult?.({ type: 'partial', text: payload.text ?? '', isFinal: false })
    } else if (payload.type === 'final') {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
      activeRequestId = ''
      onResult?.({ type: 'final', text: payload.text ?? '', isFinal: true, confidence: payload.confidence })
    }
  }

  window[ERROR_FN] = (json) => {
    const payload = safeParse(json) || {}
    clearTimeout(timeoutTimer)
    timeoutTimer = null
    activeRequestId = ''
    onResult?.({ type: 'error', code: payload.code || 'native_error', message: DESCRIPTIONS[payload.code] || payload.message || '语音功能出错' })
  }

  window[EVENT_FN] = (json) => {
    const payload = safeParse(json) || {}
    if (payload.type === 'volume') {
      onEvent?.({ type: 'volume', level: clamp01(payload.level) })
    } else if (payload.type === 'speak_start') {
      speaking = true
      onEvent?.({ type: 'speak_start' })
    } else if (payload.type === 'speak_done') {
      speaking = false
      onEvent?.({ type: 'speak_done' })
    }
  }

  const call = (method, payload) => {
    try {
      bridge[method]?.(JSON.stringify(payload ?? {}))
      return true
    } catch {
      return false
    }
  }

  return {
    kind: 'android',

    startListening({ locale = 'zh-CN', partial = true, maxDurationMs = 15000, vadSilenceMs = 1200 } = {}) {
      activeRequestId = nextRequestId('asr')
      const ok = call('startListening', {
        requestId: activeRequestId,
        locale,
        partial,
        maxDurationMs,
        vadSilenceMs,
      })
      if (!ok) {
        activeRequestId = ''
        return false
      }
      // 原生可能因为权限弹窗/来电打断永不回调，这里必须自己兜底恢复按钮。
      clearTimeout(timeoutTimer)
      timeoutTimer = setTimeout(() => {
        if (activeRequestId) {
          call('cancelListening', { requestId: activeRequestId })
          activeRequestId = ''
          onResult?.({ type: 'error', code: 'timeout', message: DESCRIPTIONS.timeout })
        }
      }, LISTEN_TIMEOUT_MS)
      return true
    },

    stopListening() {
      if (!activeRequestId) return
      call('stopListening', { requestId: activeRequestId })
    },

    cancelListening() {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
      if (!activeRequestId) return
      call('cancelListening', { requestId: activeRequestId })
      activeRequestId = ''
    },

    speak(text, { locale = 'zh-CN', rate = 1, pitch = 1 } = {}) {
      if (!text) return false
      return call('speak', { requestId: nextRequestId('tts'), text, locale, rate, pitch })
    },

    stopSpeaking() {
      speaking = false
      return call('stopSpeaking', {})
    },

    dispose() {
      this.cancelListening()
      if (window[RESULT_FN]) delete window[RESULT_FN]
      if (window[ERROR_FN]) delete window[ERROR_FN]
      if (window[EVENT_FN]) delete window[EVENT_FN]
    },
  }
}

/** 原生错误码 → 中文提示。文案要能直接告诉用户下一步做什么。 */
const DESCRIPTIONS = {
  no_permission: '未获得麦克风权限，请在系统设置中允许本应用录音',
  busy: '麦克风被其它应用占用，请稍后重试',
  no_match: '没有识别到内容，请再说一次',
  no_speech: '没有检测到说话声，请靠近麦克风再试',
  network: '语音识别服务网络异常，请检查网络',
  timeout: '语音识别超时，请重试',
  unsupported: '当前设备不支持语音功能',
  native_error: '语音功能出错，请重试或改用文字提问',
}

function safeParse(json) {
  if (!json) return null
  if (typeof json === 'object') return json
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

function clamp01(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.min(1, Math.max(0, num))
}
