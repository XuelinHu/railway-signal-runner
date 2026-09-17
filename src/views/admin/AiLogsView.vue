<script setup>
/**
 * AI 调用日志：每次对话请求一条，含延迟、首 token 时间、token 用量与错误。
 * 「首 token 时间」是排查流式体验的关键指标——它才是用户感觉到「卡了多久」，
 * 总延迟只反映生成总时长。
 */
import { RefreshCw, Search } from '@lucide/vue'
import { adminApi } from '../../api/admin'
import { formatDateTime, formatDuration, textOr } from '../../api/format'
import AdminTable from '../../components/admin/AdminTable.vue'
import DateRangeFilter from '../../components/admin/DateRangeFilter.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const STATUS_LABELS = { ok: '成功', error: '失败', aborted: '已中断' }

const query = usePagedQuery(adminApi.aiLogs, {
  pageSize: 20,
  initialFilters: { model: '', status: '', from: '', to: '' },
})

function applyTimeRange({ from, to }) {
  query.setFilter('from', from)
  query.setFilter('to', to)
}

const columns = [
  { key: 'display_name', label: '用户' },
  { key: 'model', label: '模型' },
  { key: 'endpoint', label: '端点', width: '110px' },
  { key: 'status', label: '状态', width: '90px' },
  { key: 'first_token_ms', label: '首 token', width: '110px', format: formatDuration },
  { key: 'latency_ms', label: '总延迟', width: '110px', format: formatDuration },
  { key: 'completion_tokens', label: '输出 token', width: '110px' },
  { key: 'created_at', label: '时间', width: '180px', format: formatDateTime },
]
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">AI 调用日志</h1>
      <button class="btn-ghost" type="button" @click="query.reload()">
        <RefreshCw :size="15" /> 刷新
      </button>
    </header>

    <div class="filter-bar">
      <label class="filter-item">
        <Search :size="15" />
        <input v-model="query.filters.model" placeholder="按模型名筛选，如 qwen3:14b" />
      </label>

      <label class="filter-item">
        状态
        <select v-model="query.filters.status">
          <option value="">全部</option>
          <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>

      <DateRangeFilter :from="query.filters.from" :to="query.filters.to" @change="applyTimeRange" />

      <button class="btn-ghost" type="button" @click="query.resetFilters()">重置</button>
    </div>

    <section class="panel">
      <AdminTable
        :columns="columns"
        :rows="query.items.value"
        :loading="query.loading.value"
        :error="query.error.value"
        empty-text="没有匹配的调用日志"
      >
        <template #cell-display_name="{ row }">
          {{ textOr(row.display_name || row.username || row.user_id) }}
        </template>

        <template #cell-model="{ value }">
          <span class="tag">{{ textOr(value) }}</span>
        </template>

        <template #cell-status="{ value }">
          <span class="tag" :class="value === 'ok' ? 'status-active' : 'status-disabled'">
            {{ STATUS_LABELS[value] || value }}
          </span>
        </template>

        <template #cell-completion_tokens="{ row }">
          {{ row.completion_tokens ?? '—' }}
          <small v-if="row.prompt_tokens" class="muted">/ 入 {{ row.prompt_tokens }}</small>
        </template>

        <template #row-actions="{ row }">
          <span v-if="row.error" class="ellipsis text-danger" :title="row.error">{{ row.error }}</span>
          <span v-else class="muted">—</span>
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
  </div>
</template>
