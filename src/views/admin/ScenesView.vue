<script setup>
/**
 * 训练场景管理：分页列表 + 名称搜索 + 发布/取消发布 + 软删 + 查看 payload。
 * payload 是老师端编辑器存下来的整份场景 JSON，用弹框只读展示，不做编辑——
 * 编辑入口在老师端，管理台只负责治理（发布、下架、删除）。
 */
import { ref } from 'vue'
import { Eye, RefreshCw, Search } from '@lucide/vue'
import { adminApi } from '../../api/admin'
import { formatDateTime, textOr } from '../../api/format'
import AdminTable from '../../components/admin/AdminTable.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const DIFFICULTY_LABELS = { easy: '简单', normal: '普通', hard: '困难' }

const query = usePagedQuery(adminApi.scenes, {
  pageSize: 20,
  initialFilters: { q: '', published: '', includeDeleted: '' },
})

const columns = [
  { key: 'name', label: '场景名称' },
  { key: 'description', label: '描述' },
  { key: 'difficulty', label: '难度', width: '80px' },
  { key: 'owner_display_name', label: '创建者' },
  { key: 'published', label: '状态', width: '90px' },
  { key: 'updated_at', label: '更新时间', width: '180px', format: formatDateTime },
]

const notice = ref(null)
const busyId = ref('')
const detail = ref(null)

async function run(row, task, successText) {
  busyId.value = row.id
  notice.value = null
  try {
    await task()
    notice.value = { tone: 'ok', text: successText }
    await query.reload()
  } catch (error) {
    notice.value = { tone: 'error', text: error?.message || '操作失败' }
  } finally {
    busyId.value = ''
  }
}

function togglePublish(row) {
  const next = !row.published
  return run(row, () => adminApi.publishScene(row.id), next ? `「${row.name}」已发布` : `「${row.name}」已下架`)
}

async function removeScene(row) {
  const ok = window.confirm(`确定删除场景「${row.name}」吗？学生端将不再看到它。`)
  if (!ok) return
  await run(row, () => adminApi.deleteScene(row.id), `场景「${row.name}」已删除`)
}

/** 按需拉完整 payload：列表里不带，避免一次传几十份大 JSON。 */
async function openDetail(row) {
  detail.value = { loading: true, scene: row, payload: '' }
  try {
    const data = await adminApi.sceneDetail(row.id)
    const scene = data.scene ?? row
    detail.value = {
      loading: false,
      scene,
      payload: scene.payload ? JSON.stringify(scene.payload, null, 2) : '（该场景没有保存配置数据）',
    }
  } catch (error) {
    detail.value = { loading: false, scene: row, payload: `读取失败：${error?.message || '未知错误'}` }
  }
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">训练场景</h1>
      <button class="btn-ghost" type="button" @click="query.reload()">
        <RefreshCw :size="15" /> 刷新
      </button>
    </header>

    <div class="filter-bar">
      <label class="filter-item">
        <Search :size="15" />
        <input v-model="query.filters.q" type="search" placeholder="搜索场景名称 / 描述" />
      </label>

      <label class="filter-item">
        发布状态
        <select v-model="query.filters.published">
          <option value="">全部</option>
          <option value="1">已发布</option>
          <option value="0">未发布</option>
        </select>
      </label>

      <label class="filter-item checkbox">
        <input v-model="query.filters.includeDeleted" type="checkbox" true-value="1" false-value="" />
        含已删除
      </label>
    </div>

    <p v-if="notice" class="notice" :class="notice.tone">{{ notice.text }}</p>

    <section class="panel">
      <AdminTable
        :columns="columns"
        :rows="query.items.value"
        :loading="query.loading.value"
        :error="query.error.value"
        empty-text="没有匹配的训练场景"
      >
        <template #cell-description="{ value }">
          <span class="ellipsis" :title="value">{{ textOr(value) }}</span>
        </template>

        <template #cell-difficulty="{ value }">
          <span class="tag">{{ DIFFICULTY_LABELS[value] || '未设置' }}</span>
        </template>

        <template #cell-owner_display_name="{ row }">
          {{ textOr(row.owner_display_name || row.owner_name) }}
        </template>

        <template #cell-published="{ row }">
          <span class="tag" :class="row.published ? 'status-active' : 'status-disabled'">
            {{ row.published ? '已发布' : '未发布' }}
          </span>
          <span v-if="row.deleted_at" class="tag status-disabled">已删除</span>
        </template>

        <template #row-actions="{ row }">
          <button class="link-btn" type="button" @click="openDetail(row)">
            <Eye :size="14" /> 详情
          </button>
          <button class="link-btn" type="button" :disabled="busyId === row.id" @click="togglePublish(row)">
            {{ row.published ? '下架' : '发布' }}
          </button>
          <button
            class="link-btn danger"
            type="button"
            :disabled="busyId === row.id || Boolean(row.deleted_at)"
            @click="removeScene(row)"
          >
            删除
          </button>
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

    <div v-if="detail" class="modal-mask" @click.self="detail = null">
      <div class="modal modal-wide">
        <header class="modal-head">
          <h2>{{ detail.scene.name }}</h2>
          <button class="link-btn" type="button" @click="detail = null">关闭</button>
        </header>

        <div class="modal-body">
          <dl class="detail-list">
            <dt>创建者</dt>
            <dd>{{ textOr(detail.scene.owner_display_name || detail.scene.owner_name) }}</dd>
            <dt>难度</dt>
            <dd>{{ DIFFICULTY_LABELS[detail.scene.difficulty] || '未设置' }}</dd>
            <dt>状态</dt>
            <dd>{{ detail.scene.published ? '已发布' : '未发布' }}</dd>
            <dt>发布时间</dt>
            <dd>{{ formatDateTime(detail.scene.published_at) }}</dd>
            <dt>创建时间</dt>
            <dd>{{ formatDateTime(detail.scene.created_at) }}</dd>
            <dt>更新时间</dt>
            <dd>{{ formatDateTime(detail.scene.updated_at) }}</dd>
            <dt>描述</dt>
            <dd>{{ textOr(detail.scene.description) }}</dd>
          </dl>

          <p v-if="detail.loading" class="panel-hint">正在读取场景数据…</p>
          <pre v-else class="code-block">{{ detail.payload }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
