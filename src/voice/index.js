/**
 * 语音层对外唯一入口。上层（agent store / AgentDialog）只认这一份接口，
 * 不关心底下是安卓原生桥接还是浏览器 Web Speech。
 *
 * 统一接口：
 *   kind             'android' | 'web' | 'tts-only' | 'none'
 *   label            给用户看的档位名
 *   startListening() 开始收音，返回是否成功启动
 *   stopListening()  结束收音（等待最终结果）
 *   cancelListening() 放弃收音（丢弃结果）
 *   speak(text)      朗读
 *   stopSpeaking()   停止朗读
 *   dispose()        释放
 */
export { detectVoiceCapabilities, routeVoiceSession, resetVoiceDetection } from './voiceRouter'
export { isAndroidBridgeAvailable, probeAndroidCapabilities } from './androidBridge'
export { hasSpeechRecognition, hasSpeechSynthesis, isSecureContext, describeWebSpeechLimits } from './webSpeech'

import { routeVoiceSession } from './voiceRouter'

/**
 * 创建一个语音会话。
 *
 * 注意：档位探测是异步的（安卓桥要问原生 getCapabilities），但这个函数是同步签名，
 * 上层 store 拿到的是一个「占位会话」，真实会话在探测完成后补上。这样做的原因是
 * 用户点语音按钮时必须立刻有反馈，不能等一个 await 回来才渲染按钮状态。
 *
 * @param {object} handlers
 * @param {(text: string) => void} handlers.onPartial 部分识别结果
 * @param {(text: string) => void} handlers.onFinal   最终识别结果
 * @param {(error: {code: string, message: string}) => void} handlers.onError
 * @param {(level: number) => void} handlers.onLevel  音量 0..1，驱动波形
 * @param {() => void} handlers.onSpeakStart
 * @param {() => void} handlers.onSpeakEnd
 */
export function createVoiceSession(handlers = {}) {
  let real = null
  let pendingListen = false
  let disposed = false

  const session = {
    kind: 'probing',
    label: '正在检测语音能力…',
    ready: false,

    startListening(options) {
      if (!real) {
        // 探测还没回来就先记下意图，等会话就绪后自动开始，用户不用再点一次。
        pendingListen = true
        return true
      }
      return real.startListening?.(options) ?? false
    },

    stopListening() {
      pendingListen = false
      real?.stopListening?.()
    },

    cancelListening() {
      pendingListen = false
      real?.cancelListening?.()
    },

    speak(text, options) {
      if (!real) return false
      return real.speak?.(text, options) ?? false
    },

    stopSpeaking() {
      real?.stopSpeaking?.()
    },

    dispose() {
      disposed = true
      real?.dispose?.()
      real = null
    },
  }

  routeVoiceSession({
    onResult: (event) => {
      if (event.type === 'partial') handlers.onPartial?.(event.text)
      else if (event.type === 'final') handlers.onFinal?.(event.text)
      else if (event.type === 'error') handlers.onError?.(event)
    },
    onLevel: (level) => handlers.onLevel?.(level),
    onSpeakStart: () => handlers.onSpeakStart?.(),
    onSpeakEnd: () => handlers.onSpeakEnd?.(),
    onError: (error) => handlers.onError?.(error),
  }).then((created) => {
    if (disposed) {
      created?.dispose?.()
      return
    }
    real = created
    session.kind = created?.kind ?? 'none'
    session.label = LABELS[session.kind] ?? '语音不可用'
    session.ready = true
    if (pendingListen && created?.startListening) {
      pendingListen = false
      created.startListening()
    }
  })

  return session
}

const LABELS = {
  android: '安卓原生语音',
  web: '浏览器语音',
  'tts-only': '仅朗读',
  none: '语音不可用',
}
