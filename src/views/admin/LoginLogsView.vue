<script setup>
/**
 * 登录日志。走分页列表，支持按用户名、结果、时间区间筛选。
 * 时间区间用 <input type="datetime-local">，值转成 ISO 再发给后端（后端按 timestamptz 比较）。
 */
import { RefreshCw, Search } from '@lucide/vue'
import { adminApi } from '../../api/admin'
import { formatDateTime } from '../../api/format'
import AdminTable from '../../components/admin/AdminTable.vue'
import DateRangeFilter from '../../components/admin/DateRangeFilter.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const query = usePagedQuery(adminApi.loginLogs, {
  pageSize: 20,
  initialFilters: { username: '', success: '', from: '', to: '' },
})

function applyTimeRange({ from, to }) {
  query.setFilter('from', from)
  query.setFilter('to', to)
}

const columns = [
  { key: 'username_input', label: '登录名' },
  { key: 'display_name', label: '账号姓名' },
  {
    key: 'success',
    label: '结果',
    width: '80px',
    format: (value) => (value ? '成功' : '失败'),
  },
  { key: 'failure_reason', label: '失败原因' },
  { key: 'ip', label: 'IP' },
  { key: 'user_agent', label: '客户端' },
  { key: 'created_at', label: '时间', width: '180px', format: formatDateTime },
]
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">登录日志</h1>
      <button class="btn-ghost" type="button" @click="query.reload()">
        <RefreshCw :size="15" /> 刷新
      </button>
    </header>

    <div class="filter-bar">
      <label class="filter-item">
        <Search :size="15" />
        <input v-model="query.filters.username" type="search" placeholder="搜索登录名" />
      </label>

      <label class="filter-item">
        结果
        <select v-model="query.filters.success">
          <option value="">全部</option>
          <option value="1">成功</option>
          <option value="0">失败</option>
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
        empty-text="没有匹配的登录记录"
      >
        <template #cell-success="{ value }">
          <span class="tag" :class="value ? 'status-active' : 'status-disabled'">
            {{ value ? '成功' : '失败' }}
          </span>
        </template>

        <template #cell-user_agent="{ value }">
          <span class="ellipsis" :title="value">{{ value || '—' }}</span>
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
