import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { aiApi } from '../api/ai'
import { createVoiceSession } from '../voice'

const MODEL_STORAGE_KEY = 'rsr.agentModel'
const VOICE_STORAGE_KEY = 'rsr.agentVoiceMode'

/** 语音档位：关 / 仅朗读 / 连续对话（朗读 + 说完自动发送）。 */
export const VOICE_MODES = ['off', 'tts', 'full']
export const VOICE_MODE_LABELS = { off: '语音关闭', tts: '仅朗读', full: '连续对话' }

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常，不能让整个 store 起不来。
    return fallback
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 存不下就算了，不影响本次会话使用 */
  }
}

export const useAgentStore = defineStore('agent', () => {
  /* ------------------------------- 弹框与模型 ------------------------------- */

  const open = ref(false)
  const models = ref([])
  const modelsError = ref('')
  const loadingModels = ref(false)
  const model = ref(readStored(MODEL_STORAGE_KEY, ''))

  /** 游戏内注入的场景上下文，作为系统提示词的一部分发给后端。 */
  const sceneContext = ref('')

  const availableModels = computed(() => models.value.filter((item) => item.available && !item.isEmbedding))
  const currentModel = computed(
    () => availableModels.value.find((item) => item.name === model.value) ?? null
  )

  async function loadModels({ refresh = false } = {}) {
    if (loadingModels.value) return
    loadingModels.value = true
    modelsError.value = ''
    try {
      const data = await aiApi.models(refresh)
      models.value = data.models ?? []
      const names = availableModels.value.map((item) => item.name)
      // 存着的模型可能已经被删了，回落到服务端默认模型。
      if (!names.includes(model.value)) {
        model.value = names.includes(data.defaultModel) ? data.defaultModel : (names[0] ?? '')
        writeStored(MODEL_STORAGE_KEY, model.value)
      }
    } catch (error) {
      modelsError.value = error?.message || '模型列表加载失败'
    } finally {
      loadingModels.value = false
    }
  }

  function selectModel(name) {
    model.value = name
    writeStored(MODEL_STORAGE_KEY, name)
  }

  function toggle(next) {
    open.value = typeof next === 'boolean' ? next : !open.value
    if (open.value) {
      if (models.value.length === 0) loadModels()
      if (voiceMode.value !== 'off' && !voice.session) initVoice()
    } else {
      stopSpeaking()
    }
  }

  /* ------------------------------- 会话与消息 ------------------------------- */

  const conversations = ref([])
  const conversationId = ref('')
  const messages = ref([])
  const streaming = ref(false)
  const thinking = ref(false)
  const partial = ref('')
  const error = ref('')
  let handle = null

  function reset() {
    stop()
    conversationId.value = ''
    messages.value = []
    partial.value = ''
    thinking.value = false
    error.value = ''
  }

  async function loadConversations() {
    try {
      const data = await aiApi.conversations({ page: 1, pageSize: 30 })
      conversations.value = data.items ?? []
    } catch {
      // 历史列表拉不到不影响新对话，静默即可。
      conversations.value = []
    }
  }

  async function openConversation(id) {
    stop()
    conversationId.value = id
    error.value = ''
    partial.value = ''
    try {
      const data = await aiApi.messages(id, { page: 1, pageSize: 200 })
      messages.value = (data.items ?? []).map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        model: item.model,
      }))
    } catch (err) {
      error.value = err?.message || '历史消息加载失败'
    }
  }

  async function removeConversation(id) {
    await aiApi.deleteConversation(id)
    conversations.value = conversations.value.filter((item) => item.id !== id)
    if (conversationId.value === id) reset()
  }

  /**
   * 发送一条提问并流式接收回答。
   *
   * 这里不 await 整个流，而是把 handle 存起来让 UI 能随时中断——
   * 用户点了「停止」或在生成中途又发了一条，都必须能立刻掐断。
   */
  function send(text) {
    const content = text?.trim()
    if (!content || streaming.value) return

    // 发新消息视为放弃上一轮，先断开旧连接，避免两条流同时往 messages 里写。
    stop()

    error.value = ''
    partial.value = ''
    thinking.value = false
    streaming.value = true
    messages.value.push({ id: `local-${Date.now()}`, role: 'user', content })

    // 收音期间用户又发消息：先停掉麦克风，否则识别结果会盖到输入框里。
    if (voice.listening) stopListening()

    handle = aiApi.chat(
      {
        conversationId: conversationId.value || undefined,
        model: model.value || undefined,
        message: content,
        sceneContext: sceneContext.value || undefined,
      },
      {
        onControl: (type, payload) => {
          if (type === 'meta') {
            conversationId.value = payload.conversationId
          } else if (type === 'thinking') {
            // qwen3 这类思考模型会先想几秒到几十秒，content 一直为空。
            // 收到这一帧就把「思考中」显示出来，避免用户对着空白等。
            thinking.value = true
          } else if (type === 'done') {
            finish(payload)
          } else if (type === 'error') {
            fail(payload?.message || '模型返回错误')
          }
        },
        onFrame: (frame) => {
          const delta = frame?.message?.content
          if (delta) {
            thinking.value = false
            partial.value += delta
          }
        },
        onError: (err) => fail(err?.message || '对话请求失败'),
      }
    )
  }

  function finish(payload) {
    const answer = partial.value
    if (answer) {
      messages.value.push({
        id: payload?.assistantMessageId ?? `local-a-${Date.now()}`,
        role: 'assistant',
        content: answer,
        model: model.value,
      })
      if (voiceMode.value !== 'off') speak(answer)
    }
    partial.value = ''
    thinking.value = false
    streaming.value = false
    handle = null
    if (payload?.assistantMessageId) loadConversations()
  }

  function fail(message) {
    error.value = message
    // 已经流出来的部分仍然保留在 messages 里，否则用户会觉得内容凭空消失了。
    if (partial.value) {
      messages.value.push({ id: `local-a-${Date.now()}`, role: 'assistant', content: partial.value, model: model.value })
    }
    partial.value = ''
    thinking.value = false
    streaming.value = false
    handle = null
  }

  function stop() {
    handle?.stop()
    handle = null
    if (partial.value) {
      messages.value.push({ id: `local-a-${Date.now()}`, role: 'assistant', content: partial.value, model: model.value })
      partial.value = ''
    }
    thinking.value = false
    streaming.value = false
  }

  /* ------------------------------- 语音 ------------------------------- */

  const voiceMode = ref(readStored(VOICE_STORAGE_KEY, 'off'))
  const voice = ref({ session: null, kind: 'none', label: '', listening: false, speaking: false, level: 0, error: '' })

  // 由 AgentDialog 注册：识别文本要投递到它的输入框，store 不持有输入框引用。
  let onPartialText = null
  let onFinalText = null

  function setVoiceMode(mode) {
    voiceMode.value = mode
    writeStored(VOICE_STORAGE_KEY, mode)
    if (mode === 'off') {
      stopListening()
      stopSpeaking()
    } else if (!voice.value.session) {
      initVoice()
    }
  }

  function initVoice() {
    if (voice.value.session) return voice.value.session
    const session = createVoiceSession({
      onPartial: (text) => {
        // 部分识别结果实时灌进输入框，用户能看到自己说的话正在被识别。
        voice.value = { ...voice.value, error: '' }
        onPartialText?.(text)
      },
      onFinal: (text) => {
        voice.value = { ...voice.value, listening: false, level: 0 }
        onFinalText?.(text)
      },
      onError: (err) => {
        voice.value = { ...voice.value, listening: false, level: 0, error: err?.message || '语音识别失败' }
      },
      onLevel: (level) => {
        voice.value = { ...voice.value, level }
      },
      onSpeakStart: () => {
        voice.value = { ...voice.value, speaking: true }
      },
      onSpeakEnd: () => {
        voice.value = { ...voice.value, speaking: false }
      },
    })
    voice.value = { ...voice.value, session, kind: session.kind, label: session.label }
    return session
  }

  function bindTextSink({ onPartial, onFinal }) {
    onPartialText = onPartial
    onFinalText = onFinal
  }

  function startListening() {
    const session = initVoice()
    // 打断播报：用户开口就说明不想听了。
    session.stopSpeaking()
    voice.value = { ...voice.value, error: '' }
    const started = session.startListening()
    if (started) voice.value = { ...voice.value, listening: true }
  }

  function stopListening() {
    voice.value.session?.stopListening()
    voice.value = { ...voice.value, listening: false, level: 0 }
  }

  function speak(text) {
    const session = initVoice()
    session.speak(text)
  }

  function stopSpeaking() {
    voice.value.session?.stopSpeaking()
    voice.value = { ...voice.value, speaking: false }
  }

  const voiceSupported = computed(() => voice.value.kind !== 'none')

  return {
    open,
    models,
    modelsError,
    loadingModels,
    model,
    currentModel,
    availableModels,
    sceneContext,
    conversations,
    conversationId,
    messages,
    streaming,
    thinking,
    partial,
    error,
    voiceMode,
    voice,
    voiceSupported,
    toggle,
    loadModels,
    selectModel,
    loadConversations,
    openConversation,
    removeConversation,
    send,
    stop,
    reset,
    setVoiceMode,
    bindTextSink,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
})
