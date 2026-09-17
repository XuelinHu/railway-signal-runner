<script setup>
/**
 * 成绩记录：分页列表 + 学生/场景搜索 + 完成状态筛选。
 * 记录同时保留了 student_name（提交时的快照）和 user_id 关联的账号信息，
 * 展示时优先用账号姓名，账号被删了才回落到快照，保证历史成绩不会变成空白。
 */
import { RefreshCw, Search } from '@lucide/vue'
import { adminApi } from '../../api/admin'
import { formatDateTime, formatSeconds, textOr } from '../../api/format'
import AdminTable from '../../components/admin/AdminTable.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const query = usePagedQuery(adminApi.records, {
  pageSize: 20,
  initialFilters: { q: '', completed: '' },
})

const columns = [
  { key: 'student_name', label: '学员' },
  { key: 'scene_name', label: '训练场景' },
  { key: 'score', label: '得分', width: '90px' },
  { key: 'inspected_count', label: '检查项', width: '90px' },
  { key: 'mistake_count', label: '错误数', width: '90px' },
  { key: 'elapsed_seconds', label: '用时', width: '110px', format: formatSeconds },
  { key: 'completed', label: '状态', width: '90px' },
  { key: 'created_at', label: '提交时间', width: '180px', format: formatDateTime },
]
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">成绩记录</h1>
      <button class="btn-ghost" type="button" @click="query.reload()">
        <RefreshCw :size="15" /> 刷新
      </button>
    </header>

    <div class="filter-bar">
      <label class="filter-item">
        <Search :size="15" />
        <input v-model="query.filters.q" type="search" placeholder="搜索学员姓名 / 场景名称" />
      </label>

      <label class="filter-item">
        完成状态
        <select v-model="query.filters.completed">
          <option value="">全部</option>
          <option value="1">已完成</option>
          <option value="0">未完成</option>
        </select>
      </label>
    </div>

    <section class="panel">
      <AdminTable
        :columns="columns"
        :rows="query.items.value"
        :loading="query.loading.value"
        :error="query.error.value"
        empty-text="没有匹配的成绩记录"
      >
        <template #cell-student_name="{ row }">
          {{ textOr(row.display_name || row.username || row.student_name) }}
        </template>

        <template #cell-score="{ value }">
          <strong>{{ value ?? 0 }}</strong>
        </template>

        <template #cell-mistake_count="{ value }">
          <span :class="{ 'text-danger': Number(value) > 0 }">{{ value ?? 0 }}</span>
        </template>

        <template #cell-completed="{ value }">
          <span class="tag" :class="value ? 'status-active' : 'status-disabled'">
            {{ value ? '已完成' : '未完成' }}
          </span>
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
