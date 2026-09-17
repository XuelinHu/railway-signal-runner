<script setup>
/**
 * 智能体弹框。
 *
 * 交互闭环：
 *   提问 → 流式返回（思考模型先显示"思考中"）→ 完成后按语音档位朗读
 *   收音中收到最终识别结果 → 连续对话档位下自动发送
 *   用户开口 → 立刻停止朗读（barge-in）
 *
 * 弹框本身只管渲染，所有状态和网络都在 stores/agent.js 里。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Bot, Copy, History, Mic, MicOff, Send, Square, Trash2, Volume2, VolumeX, X } from '@lucide/vue'
import { useAgentStore, VOICE_MODE_LABELS, VOICE_MODES } from '../../stores/agent'
import { useAuthStore } from '../../stores/auth'

const agent = useAgentStore()
const auth = useAuthStore()

const draft = ref('')
const showHistory = ref(false)
const copiedId = ref('')
const bodyRef = ref(null)

/* --------------------------- 输入框与语音的对接 --------------------------- */

// 语音识别结果要落进这个输入框，所以把 setter 注册给 store。
agent.bindTextSink({
  onPartial: (text) => {
    draft.value = text
  },
  onFinal: (text) => {
    draft.value = text
    if (agent.voiceMode === 'full') {
      send()
    }
  },
})

function send() {
  const text = draft.value.trim()
  if (!text || agent.streaming) return
  draft.value = ''
  agent.send(text)
}

function onKeydown(event) {
  // Enter 发送，Shift+Enter 换行。中文输入法组字期间不能拦，否则选词会被当成发送。
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
}

function toggleMic() {
  if (agent.voice.listening) agent.stopListening()
  else agent.startListening()
}

/* ------------------------------- 消息操作 ------------------------------- */

async function copyMessage(message) {
  try {
    await navigator.clipboard.writeText(message.content)
    copiedId.value = message.id
    setTimeout(() => {
      if (copiedId.value === message.id) copiedId.value = ''
    }, 1500)
  } catch {
    // http 公网地址下剪贴板会被拒，此时退回选中文本让用户自己复制。
    copiedId.value = ''
  }
}

function speakMessage(message) {
  if (agent.voice.speaking) agent.stopSpeaking()
  else agent.speak(message.content)
}

/* ------------------------------- 滚动跟随 ------------------------------- */

async function scrollToBottom() {
  await nextTick()
  const el = bodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// 流式过程中 partial 每帧都在变，跟着滚到底部，否则用户看不到新内容。
watch(() => [agent.messages.length, agent.partial, agent.thinking], scrollToBottom)

watch(
  () => agent.open,
  (open) => {
    if (open) {
      agent.loadConversations()
      scrollToBottom()
    }
  }
)

onMounted(() => {
  if (agent.models.length === 0) agent.loadModels()
})

const voiceLabel = computed(() => {
  if (!agent.voiceSupported) return '当前环境不支持语音输入'
  const mode = VOICE_MODE_LABELS[agent.voiceMode] ?? '语音关闭'
  return `${mode} · ${agent.voice.session?.label ?? '检测中'}`
})

function close() {
  agent.stop()
  agent.toggle(false)
}
</script>

<template>
  <div v-if="agent.open" class="modal-mask" @click.self="close">
    <div class="agent-dialog">
      <header class="agent-head">
        <Bot :size="18" />
        <h2>信号巡检助手</h2>

        <select
          :value="agent.model"
          :disabled="agent.loadingModels || agent.streaming"
          @change="agent.selectModel($event.target.value)"
        >
          <option v-if="agent.availableModels.length === 0" value="">没有可用模型</option>
          <option v-for="item in agent.availableModels" :key="item.name" :value="item.name">
            {{ item.name }}<template v-if="item.sizeText"> · {{ item.sizeText }}</template>
            <template v-if="item.running"> · 已加载</template>
          </option>
        </select>

        <button class="link-btn" type="button" :title="'历史会话'" @click="showHistory = !showHistory">
          <History :size="16" />
        </button>
        <button class="link-btn" type="button" title="关闭" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div v-if="showHistory" class="panel" style="margin: 0; border-radius: 0; border-left: none; border-right: none">
        <p v-if="agent.conversations.length === 0" class="panel-hint">还没有历史会话。</p>
        <ul v-else class="history-list">
          <li v-for="item in agent.conversations" :key="item.id">
            <button class="link-btn" type="button" @click="agent.openConversation(item.id); showHistory = false">
              {{ item.title || '未命名会话' }}
              <small class="muted">{{ item.message_count }} 条</small>
            </button>
            <button class="link-btn danger" type="button" @click="agent.removeConversation(item.id)">
              <Trash2 :size="13" />
            </button>
          </li>
        </ul>
      </div>

      <div ref="bodyRef" class="agent-body">
        <div v-if="agent.messages.length === 0 && !agent.streaming" class="agent-empty">
          <p>我是铁道信号巡检助手，可以问：</p>
          <p>「进站信号机红灯的含义是什么？」</p>
          <p>「区间占用逻辑检查怎么判断？」</p>
          <p v-if="!auth.isAuthenticated" class="text-danger">
            当前未登录，提问会失败，请先登录后再试。
          </p>
        </div>

        <div
          v-for="message in agent.messages"
          :key="message.id"
          class="agent-bubble"
          :class="message.role"
        >
          {{ message.content }}
          <div v-if="message.role === 'assistant'" class="agent-bubble-actions">
            <button class="link-btn" type="button" @click="copyMessage(message)">
              <Copy :size="13" /> {{ copiedId === message.id ? '已复制' : '复制' }}
            </button>
            <button class="link-btn" type="button" @click="speakMessage(message)">
              <Volume2 :size="13" /> 朗读
            </button>
          </div>
        </div>

        <div v-if="agent.thinking && !agent.partial" class="agent-bubble assistant thinking">
          正在思考…
        </div>

        <div v-if="agent.partial" class="agent-bubble assistant">
          {{ agent.partial }}
        </div>
      </div>

      <footer class="agent-foot">
        <p v-if="agent.error" class="form-error">{{ agent.error }}</p>
        <p v-if="agent.voice.error" class="form-error">{{ agent.voice.error }}</p>
        <p v-if="agent.modelsError" class="form-error">{{ agent.modelsError }}</p>

        <div class="agent-input-row">
          <textarea
            v-model="draft"
            rows="2"
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            :disabled="agent.streaming"
            @keydown="onKeydown"
          />

          <button
            v-if="agent.streaming"
            class="btn-ghost"
            type="button"
            title="停止生成"
            @click="agent.stop()"
          >
            <Square :size="15" /> 停止
          </button>
          <button v-else class="btn-primary" type="button" :disabled="!draft.trim()" @click="send">
            <Send :size="15" /> 发送
          </button>
        </div>

        <div class="agent-toolbar">
          <button
            class="link-btn"
            type="button"
            :disabled="!agent.voiceSupported"
            :title="voiceLabel"
            @click="toggleMic"
          >
            <component :is="agent.voice.listening ? MicOff : Mic" :size="14" />
            {{ agent.voice.listening ? '停止收音' : '语音提问' }}
          </button>

          <span v-if="agent.voice.listening" class="voice-wave" aria-hidden="true">
            <i
              v-for="bar in 5"
              :key="bar"
              :style="{ height: `${4 + agent.voice.level * (bar % 2 ? 14 : 9)}px` }"
            />
          </span>

          <label>
            <VolumeX v-if="agent.voiceMode === 'off'" :size="14" />
            <Volume2 v-else :size="14" />
            语音
            <select
              :value="agent.voiceMode"
              @change="agent.setVoiceMode($event.target.value)"
            >
              <option v-for="mode in VOICE_MODES" :key="mode" :value="mode">
                {{ VOICE_MODE_LABELS[mode] }}
              </option>
            </select>
          </label>

          <span class="spacer" />
          <span v-if="agent.voice.speaking" class="muted">正在朗读…</span>
        </div>

        <p v-if="!agent.voiceSupported" class="panel-hint" style="margin: 8px 0 0">
          当前环境不支持语音输入，请使用文字提问。
        </p>
      </footer>
    </div>
  </div>
</template>
