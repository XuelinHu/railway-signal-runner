<script setup>
/**
 * AI 会话：左侧分页会话列表，右侧打开某个会话后分页看它的消息。
 *
 * 右侧消息是独立的一页数据（默认每页 50），不复用左侧的 usePagedQuery——
 * 两个列表的分页状态必须互相独立，否则翻消息会把会话列表也翻走。
 */
import { reactive, ref } from 'vue'
import { RefreshCw, Search } from '@lucide/vue'
import { adminApi } from '../../api/admin'
import { formatDateTime, formatRelative, textOr, truncate } from '../../api/format'
import AdminTable from '../../components/admin/AdminTable.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const query = usePagedQuery(adminApi.conversations, {
  pageSize: 20,
  initialFilters: { q: '', model: '' },
})

const columns = [
  { key: 'title', label: '会话标题' },
  { key: 'display_name', label: '所属用户' },
  { key: 'model', label: '模型' },
  { key: 'message_count', label: '消息数', width: '90px' },
  { key: 'updated_at', label: '最近活动', width: '160px', format: formatRelative },
  { key: 'created_at', label: '创建时间', width: '180px', format: formatDateTime },
]

const notice = ref(null)

async function removeConversation(row) {
  const ok = window.confirm(`确定删除会话「${row.title || row.id}」吗？其中的消息会一并删除。`)
  if (!ok) return
  try {
    await adminApi.deleteConversation(row.id)
    if (messages.conversationId === row.id) closeMessages()
    notice.value = { tone: 'ok', text: '会话已删除' }
    await query.reload()
  } catch (error) {
    notice.value = { tone: 'error', text: error?.message || '删除失败' }
  }
}

/* ------------------------------- 消息抽屉 ------------------------------- */

// 用 reactive 而不是 ref：模板里 messages.pageSize 这类深层字段会被 PaginationBar
// 的分页回调直接改写，包在 ref 里每次都要 .value，容易漏。
const messages = reactive({
  open: false,
  conversationId: '',
  conversation: null,
  items: [],
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 1,
  loading: false,
  error: '',
})

async function loadMessages(conversationId, page = 1) {
  messages.loading = true
  messages.error = ''
  messages.page = page
  try {
    const data = await adminApi.conversationMessages(conversationId, { page, pageSize: messages.pageSize })
    messages.conversation = data.conversation ?? messages.conversation
    messages.items = data.items ?? []
    messages.total = data.total ?? 0
    messages.totalPages = data.totalPages ?? 1
    messages.page = data.page ?? page
    messages.pageSize = data.pageSize ?? messages.pageSize
  } catch (error) {
    messages.error = error?.message || '消息加载失败'
    messages.items = []
    messages.total = 0
    messages.totalPages = 1
  } finally {
    messages.loading = false
  }
}

function openMessages(row) {
  messages.open = true
  messages.conversationId = row.id
  messages.conversation = { id: row.id, title: row.title, model: row.model }
  return loadMessages(row.id, 1)
}

function closeMessages() {
  messages.open = false
  messages.conversationId = ''
  messages.conversation = null
  messages.items = []
}

function changeMessagePage(next) {
  return loadMessages(messages.conversationId, next)
}

function changeMessagePageSize(size) {
  messages.pageSize = size
  return loadMessages(messages.conversationId, 1)
}

const ROLE_LABELS = { user: '提问', assistant: '回答', system: '系统' }
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">AI 会话</h1>
      <button class="btn-ghost" type="button" @click="query.reload()">
        <RefreshCw :size="15" /> 刷新
      </button>
    </header>

    <div class="filter-bar">
      <label class="filter-item">
        <Search :size="15" />
        <input v-model="query.filters.q" type="search" placeholder="搜索会话标题 / 用户名" />
      </label>

      <label class="filter-item">
        模型
        <input v-model="query.filters.model" placeholder="如 qwen3:14b" />
      </label>
    </div>

    <p v-if="notice" class="notice" :class="notice.tone">{{ notice.text }}</p>

    <section class="panel">
      <AdminTable
        :columns="columns"
        :rows="query.items.value"
        :loading="query.loading.value"
        :error="query.error.value"
        empty-text="还没有任何 AI 会话"
      >
        <template #cell-title="{ row }">
          <button class="link-btn" type="button" @click="openMessages(row)">
            {{ truncate(row.title, 40) }}
          </button>
        </template>

        <template #cell-display_name="{ row }">
          {{ textOr(row.display_name || row.username) }}
        </template>

        <template #cell-model="{ value }">
          <span class="tag">{{ textOr(value, '未记录') }}</span>
        </template>

        <template #row-actions="{ row }">
          <button class="link-btn" type="button" @click="openMessages(row)">查看消息</button>
          <button class="link-btn danger" type="button" @click="removeConversation(row)">删除</button>
        </template>
      </AdminTable>

      <PaginationBar
        :page="query.page.value"
        :page-size="query.pageSize.value"
        :total="query.total.value"
        :total-pages="query.totalPages.value"
        :disabled="query.loading.value"
        @change="query.setPage"
        @size-change="query.setPageSize"
      />
    </section>

    <div v-if="messages.open" class="modal-mask" @click.self="closeMessages">
      <div class="modal modal-wide">
        <header class="modal-head">
          <h2>{{ messages.conversation?.title || '会话消息' }}</h2>
          <button class="link-btn" type="button" @click="closeMessages">关闭</button>
        </header>

        <div class="modal-body">
          <p v-if="messages.loading" class="panel-hint">正在加载消息…</p>
          <p v-else-if="messages.error" class="form-error">{{ messages.error }}</p>
          <p v-else-if="messages.items.length === 0" class="panel-hint">该会话没有消息</p>

          <ol v-else class="message-list">
            <li v-for="message in messages.items" :key="message.id" :class="`role-${message.role}`">
              <header>
                <span class="tag">{{ ROLE_LABELS[message.role] || message.role }}</span>
                <small>{{ formatDateTime(message.created_at) }}</small>
                <small v-if="message.model">{{ message.model }}</small>
                <small v-if="message.latency_ms">{{ message.latency_ms }} ms</small>
                <span v-if="message.status && message.status !== 'ok'" class="tag status-disabled">
                  {{ message.status }}
                </span>
              </header>
              <p>{{ message.content || '（空）' }}</p>
            </li>
          </ol>
        </div>

        <footer v-if="messages.total > 0" class="modal-foot">
          <PaginationBar
            :page="messages.page"
            :page-size="messages.pageSize"
            :total="messages.total"
            :total-pages="messages.totalPages"
            :disabled="messages.loading"
            @change="changeMessagePage"
            @size-change="changeMessagePageSize"
          />
        </footer>
      </div>
    </div>
  </div>
</template>
