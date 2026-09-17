/**
 * 语音档位选择。
 *
 * 按 1 → 2 → 3 依次尝试，用第一个真正可用的：
 *   1. 安卓原生桥接 —— 公网 http 地址下手机端唯一能用的路径（原生不受安全上下文限制）
 *   2. 浏览器 Web Speech —— 桌面 Chromium 且在 localhost / https 下可用；
 *      识别不可用但播报可用时降级为 tts-only
 *   3. 都不可用 —— 返回 null，UI 提示改用文字提问
 *
 * 探测结果是异步的（原生 getCapabilities 可能要给系统一点时间），
 * 所以对外暴露 async 的选择函数，由 store 在首次需要时调用一次并缓存。
 */
import { createAndroidVoiceSession, isAndroidBridgeAvailable, probeAndroidCapabilities } from './androidBridge'
import { createWebSpeechSession, describeWebSpeechLimits, hasSpeechRecognition, hasSpeechSynthesis } from './webSpeech'

let cachedChoice = null

/**
 * @returns {Promise<{kind: 'android'|'web'|'tts-only'|'none', label: string, hint: string}>}
 */
export async function detectVoiceCapabilities() {
  if (cachedChoice) return cachedChoice

  if (isAndroidBridgeAvailable()) {
    const capabilities = await probeAndroidCapabilities()
    if (capabilities?.asr || capabilities?.tts) {
      cachedChoice = {
        kind: 'android',
        label: '安卓原生语音',
        hint: capabilities.asr ? '可以使用麦克风提问，回答会朗读出来' : '当前设备只能朗读回答，无法录音',
      }
      return cachedChoice
    }
  }

  if (hasSpeechRecognition() || hasSpeechSynthesis()) {
    const canRecognize = hasSpeechRecognition() && !describeWebSpeechLimits()
    cachedChoice = {
      kind: canRecognize ? 'web' : 'tts-only',
      label: canRecognize ? '浏览器语音' : '仅朗读',
      hint: canRecognize ? '使用浏览器语音识别，回答会朗读出来' : describeWebSpeechLimits(),
    }
    return cachedChoice
  }

  cachedChoice = { kind: 'none', label: '不支持语音', hint: '当前环境不支持语音输入，请使用文字提问' }
  return cachedChoice
}

/**
 * 创建会话。会在内部先做一次能力探测。
 * @returns {Promise<object|null>} 统一接口的会话；三档都不可用时返回 null
 */
export async function routeVoiceSession(handlers = {}) {
  const choice = await detectVoiceCapabilities()

  if (choice.kind === 'android') {
    const session = createAndroidVoiceSession({
      onResult: (event) => {
        if (event.type === 'error') handlers.onError?.(event)
        else handlers.onResult?.(event)
      },
      onEvent: (event) => {
        if (event.type === 'volume') handlers.onLevel?.(event.level)
        else if (event.type === 'speak_start') handlers.onSpeakStart?.()
        else if (event.type === 'speak_done') handlers.onSpeakEnd?.()
      },
    })
    if (session) return session
  }

  const web = createWebSpeechSession({
    onResult: (event) => {
      if (event.type === 'error') handlers.onError?.(event)
      else handlers.onResult?.(event)
    },
    onEvent: (event) => {
      if (event.type === 'speak_start') handlers.onSpeakStart?.()
      else if (event.type === 'speak_done') handlers.onSpeakEnd?.()
    },
  })
  // 浏览器档没有音量回调，波形用一条扁平的假电平驱动，至少能表示"正在收音"。
  if (web) {
    const originalStart = web.startListening.bind(web)
    web.startListening = (...args) => {
      const ok = originalStart(...args)
      if (ok) handlers.onLevel?.(0.5)
      return ok
    }
  }
  return web
}

/** 仅用于测试或环境变化后重新探测。 */
export function resetVoiceDetection() {
  cachedChoice = null
}
