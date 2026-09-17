<script setup>
import { onMounted, ref } from 'vue'
import { adminApi, ROLE_LABELS } from '../../api/admin'
import { formatDateTime } from '../../api/format'
import AdminTable from '../../components/admin/AdminTable.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const stats = ref(null)
const statsError = ref('')
const loadingStats = ref(true)

// 统计卡片是按需拉的一次性数据，但下面的「最近登录」仍然是分页列表。
const recent = usePagedQuery((params) => adminApi.recentLogins(params), { pageSize: 10 })

const recentColumns = [
  { key: 'username_input', label: '登录名' },
  { key: 'display_name', label: '姓名' },
  { key: 'ip', label: 'IP' },
  { key: 'created_at', label: '时间', width: '180px', format: formatDateTime },
]

onMounted(async () => {
  try {
    stats.value = await adminApi.stats()
  } catch (error) {
    statsError.value = error?.message || '统计加载失败'
  } finally {
    loadingStats.value = false
  }
})
</script>

<template>
  <div class="admin-page">
    <h1 class="admin-page-title">概览</h1>

    <p v-if="loadingStats" class="panel-hint">正在加载统计数据…</p>
    <p v-else-if="statsError" class="form-error">{{ statsError }}</p>

    <template v-else-if="stats">
      <div class="stat-grid">
        <article class="stat-card">
          <span>用户总数</span>
          <strong>{{ stats.users?.total ?? 0 }}</strong>
          <small>
            <template v-for="(count, role) in stats.users?.byRole || {}" :key="role">
              {{ ROLE_LABELS[role] || role }} {{ count }} ·
            </template>
          </small>
        </article>

        <article class="stat-card">
          <span>今日登录</span>
          <strong>{{ stats.logins?.today ?? 0 }}</strong>
          <small>失败 {{ stats.logins?.todayFailed ?? 0 }} 次</small>
        </article>

        <article class="stat-card">
          <span>训练场景</span>
          <strong>{{ stats.scenes?.total ?? 0 }}</strong>
          <small>已发布 {{ stats.scenes?.published ?? 0 }}</small>
        </article>

        <article class="stat-card">
          <span>成绩记录</span>
          <strong>{{ stats.records?.total ?? 0 }}</strong>
          <small>已完成 {{ stats.records?.completed ?? 0 }}</small>
        </article>

        <article class="stat-card">
          <span>AI 会话</span>
          <strong>{{ stats.conversations?.total ?? 0 }}</strong>
          <small>消息 {{ stats.messages?.total ?? 0 }} 条</small>
        </article>

        <article class="stat-card">
          <span>模型</span>
          <strong>{{ stats.ai?.models ?? 0 }}</strong>
          <small>
            已加载 {{ stats.ai?.loaded ?? 0 }} ·
            {{ stats.ai?.ollamaReachable ? 'Ollama 正常' : 'Ollama 不可达' }}
          </small>
        </article>
      </div>
    </template>

    <section class="panel">
      <h2>最近登录</h2>
      <AdminTable
        :columns="recentColumns"
        :rows="recent.items.value"
        :loading="recent.loading.value"
        :error="recent.error.value"
        empty-text="暂无登录记录"
      />
      <PaginationBar
        v-if="recent.total.value > 0"
        :page="recent.page.value"
        :page-size="recent.pageSize.value"
        :total="recent.total.value"
        :total-pages="recent.totalPages.value"
        :disabled="recent.loading.value"
        @change="recent.setPage"
        @size-change="recent.setPageSize"
      />
    </section>
  </div>
</template>
