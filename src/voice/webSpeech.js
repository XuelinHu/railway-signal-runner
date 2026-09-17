/**
 * 浏览器 Web Speech 档位。
 *
 * 两个 API 的可用性并不一致，必须分开判断：
 * - 语音识别 `SpeechRecognition`：只在 Chromium 系存在，且要求【安全上下文】。
 *   本项目的公网入口是 http://47.120.48.245:14029，不是安全上下文，
 *   浏览器会直接禁用麦克风——这正是安卓壳必须走原生桥接的原因。
 *   本机 http://127.0.0.1:4029 与 https 下则可用（localhost 被视为安全上下文）。
 * - 语音播报 `speechSynthesis`：不受安全上下文限制，http 下也能用。
 *   中文音质取决于操作系统装的语音引擎，引擎缺失时 speak() 会静默失败。
 */

export function hasSpeechRecognition() {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function hasSpeechSynthesis() {
  if (typeof window === 'undefined') return false
  return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined'
}

/** 安全上下文判断：localhost / 127.0.0.1 也算。 */
export function isSecureContext() {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location?.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export function describeWebSpeechLimits() {
  if (!hasSpeechRecognition()) {
    return '当前浏览器不支持语音识别（需要 Chrome / Edge 等 Chromium 内核浏览器）'
  }
  if (!isSecureContext()) {
    return '当前页面不是安全上下文（需 https 或 localhost），浏览器已禁用麦克风，请改用文字提问'
  }
  return ''
}

/**
 * 创建浏览器语音会话。
 * 识别不可用但播报可用时依然返回会话（kind 标为 'tts-only'），
 * 这样桌面端至少还能朗读回答。
 */
export function createWebSpeechSession({ onResult, onEvent } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const canRecognize = Boolean(Recognition) && isSecureContext()
  const canSpeak = hasSpeechSynthesis()

  if (!canRecognize && !canSpeak) return null

  let recognition = null
  let listening = false

  function buildRecognition() {
    const instance = new Recognition()
    instance.lang = 'zh-CN'
    instance.continuous = false
    // 部分结果对"边说边显示"很关键；安卓原生桥接那边也要求同样的能力。
    instance.interimResults = true
    instance.maxAlternatives = 1

    instance.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) final += result[0].transcript
        else interim += result[0].transcript
      }
      if (interim) onResult?.({ type: 'partial', text: interim, isFinal: false })
      if (final) onResult?.({ type: 'final', text: final, isFinal: true })
    }

    instance.onerror = (event) => {
      listening = false
      onResult?.({ type: 'error', code: event.error || 'native_error', message: describeRecognitionError(event.error) })
    }

    instance.onend = () => {
      listening = false
      onEvent?.({ type: 'listen_end' })
    }

    return instance
  }

  return {
    kind: canRecognize ? 'web' : 'tts-only',

    startListening() {
      if (!canRecognize) return false
      if (listening) return true
      try {
        recognition = recognition ?? buildRecognition()
        recognition.start()
        listening = true
        return true
      } catch {
        // Chrome 在「上一次还没结束时又 start」时会抛 InvalidStateError。
        listening = false
        return false
      }
    },

    stopListening() {
      if (!recognition || !listening) return
      try {
        recognition.stop()
      } catch {
        /* 已经停了 */
      }
      listening = false
    },

    cancelListening() {
      if (!recognition) return
      try {
        recognition.abort()
      } catch {
        /* 已经停了 */
      }
      listening = false
    },

    speak(text, { rate = 1, pitch = 1 } = {}) {
      if (!canSpeak || !text) return false
      try {
        window.speechSynthesis.cancel()
        const utterance = new window.SpeechSynthesisUtterance(text)
        utterance.lang = 'zh-CN'
        utterance.rate = rate
        utterance.pitch = pitch
        utterance.onstart = () => onEvent?.({ type: 'speak_start' })
        utterance.onend = () => onEvent?.({ type: 'speak_done' })
        // 系统没有中文引擎时不会报错，只会一直不触发 onstart；用 onerror 兜一层。
        utterance.onerror = () => onEvent?.({ type: 'speak_done' })
        window.speechSynthesis.speak(utterance)
        return true
      } catch {
        return false
      }
    },

    stopSpeaking() {
      if (!canSpeak) return
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* 忽略 */
      }
    },

    dispose() {
      this.cancelListening()
      this.stopSpeaking()
      recognition = null
    },
  }
}

function describeRecognitionError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '浏览器拒绝了麦克风权限，请在地址栏的权限设置里允许后重试'
    case 'no-speech':
      return '没有检测到说话声，请靠近麦克风再试'
    case 'audio-capture':
      return '没有找到可用的麦克风设备'
    case 'network':
      return '语音识别服务网络异常（Chrome 的识别依赖在线服务）'
    case 'aborted':
      return '语音识别已取消'
    default:
      return '语音识别失败，请重试或改用文字提问'
  }
}
