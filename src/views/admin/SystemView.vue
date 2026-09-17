<script setup>
/**
 * 系统设置 + 操作审计。
 *
 * 这一页把「系统信息」和「操作审计」放在一起，是因为两者都是低频查看的运维视图，
 * 单独开一个菜单会显得菜单很长而内容很空。审计日志仍然是分页列表。
 *
 * 配置项全部只读：它们来自服务端 .env，改这里不会生效，反而会让人误以为改了配置。
 * 需要改配置就改 server/.env 并重启进程。
 */
import { computed, onMounted, ref } from 'vue'
import { RefreshCw, Search } from '@lucide/vue'
import { adminApi } from '../../api/admin'
import { formatDateTime, formatDuration, formatUptime, textOr } from '../../api/format'
import AdminTable from '../../components/admin/AdminTable.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const info = ref(null)
const infoError = ref('')
const loadingInfo = ref(true)

const audit = usePagedQuery(adminApi.auditLogs, {
  pageSize: 20,
  initialFilters: { action: '' },
})

const auditColumns = [
  { key: 'created_at', label: '时间', width: '180px', format: formatDateTime },
  { key: 'username', label: '操作人' },
  { key: 'action', label: '动作' },
  { key: 'target_type', label: '对象类型' },
  { key: 'target_id', label: '对象 ID' },
  { key: 'ip', label: 'IP' },
]

async function loadInfo() {
  loadingInfo.value = true
  infoError.value = ''
  try {
    info.value = await adminApi.system()
  } catch (error) {
    infoError.value = error?.message || '系统信息加载失败'
  } finally {
    loadingInfo.value = false
  }
}

onMounted(loadInfo)

/** 秒 → 人类可读，用于 TTL 这类配置展示。 */
const CONFIG_LABELS = {
  bcryptRounds: 'bcrypt 代价因子',
  accessTtlSeconds: '访问令牌有效期',
  refreshTtlSeconds: '刷新令牌有效期',
  resetTtlSeconds: '重置链接有效期',
  maxFailedLogins: '允许连续登录失败次数',
  lockMinutes: '锁定时长（分钟）',
  allowTeacherSelfRegister: '允许老师自助注册',
  exposeResetToken: '接口回显重置令牌',
  keepAlive: 'Ollama 保活时长',
  systemPrompt: '系统提示词',
}

const configEntries = computed(() => {
  const config = info.value?.config ?? {}
  return Object.entries(config).map(([key, value]) => ({
    key,
    label: CONFIG_LABELS[key] || key,
    value:
      typeof value === 'boolean'
        ? value
          ? '是'
          : '否'
        : key.endsWith('TtlSeconds')
          ? formatDuration(Number(value) * 1000)
          : textOr(value),
  }))
})

const resetTokenWarning = computed(() => info.value?.config?.exposeResetToken)
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">系统设置</h1>
      <button class="btn-ghost" type="button" :disabled="loadingInfo" @click="loadInfo">
        <RefreshCw :size="15" /> 刷新
      </button>
    </header>

    <p v-if="loadingInfo" class="panel-hint">正在读取系统信息…</p>
    <p v-else-if="infoError" class="form-error">{{ infoError }}</p>

    <template v-else-if="info">
      <div class="stat-grid">
        <article class="stat-card">
          <span>服务状态</span>
          <strong>{{ info.database?.ok ? '正常' : '异常' }}</strong>
          <small>数据库 {{ info.database?.name }} @ {{ info.database?.host }}:{{ info.database?.port }}</small>
        </article>

        <article class="stat-card">
          <span>模型服务</span>
          <strong>{{ info.ollama?.ok ? '正常' : '不可达' }}</strong>
          <small>{{ textOr(info.ollama?.version, '版本未知') }} · {{ info.models?.total ?? 0 }} 个模型</small>
        </article>

        <article class="stat-card">
          <span>已加载模型</span>
          <strong>{{ info.models?.loaded ?? 0 }}</strong>
          <small>默认：{{ textOr(info.models?.defaultModel) }}</small>
        </article>

        <article class="stat-card">
          <span>进程内存</span>
          <strong>{{ info.server?.memoryMb ?? 0 }} MB</strong>
          <small>Node {{ info.server?.nodeVersion }} · {{ info.server?.platform }}</small>
        </article>

        <article class="stat-card">
          <span>已运行</span>
          <strong>{{ formatUptime(info.server?.uptimeSeconds) }}</strong>
          <small>环境 {{ info.server?.env }} · 端口 {{ info.server?.apiPort }}</small>
        </article>
      </div>

      <section class="panel">
        <h2>运行配置</h2>
        <p class="panel-hint">
          以下配置来自服务端 <code>.env</code>，在此只读。修改需要编辑
          <code>server/.env</code> 并重启 API 进程。
        </p>

        <p v-if="resetTokenWarning" class="notice error">
          当前 <code>EXPOSE_RESET_TOKEN</code> 为开启状态：忘记密码接口会在响应里回显重置令牌。
          这仅适合本机调试，公网环境必须关闭。
        </p>

        <dl class="detail-list">
          <template v-for="entry in configEntries" :key="entry.key">
            <dt>{{ entry.label }}</dt>
            <dd>{{ entry.value }}</dd>
          </template>
        </dl>
      </section>

      <section class="panel">
        <h2>模型来源</h2>
        <pre class="code-block">{{ JSON.stringify(info.models?.sources ?? {}, null, 2) }}</pre>
      </section>
    </template>

    <section class="panel">
      <h2>操作审计</h2>
      <p class="panel-hint">管理员的敏感操作（建号、改权限、重置密码、发布/删除场景与会话）都会记录在这里。</p>

      <div class="filter-bar">
        <label class="filter-item">
          <Search :size="15" />
          <input v-model="audit.filters.action" type="search" placeholder="按动作筛选，如 admin.delete_user" />
        </label>
      </div>

      <AdminTable
        :columns="auditColumns"
        :rows="audit.items.value"
        :loading="audit.loading.value"
        :error="audit.error.value"
        empty-text="暂无审计记录"
      >
        <template #cell-action="{ value }">
          <span class="tag">{{ textOr(value) }}</span>
        </template>
        <template #cell-target_id="{ value }">
          <span class="ellipsis" :title="value">{{ textOr(value) }}</span>
        </template>
      </AdminTable>

      <PaginationBar
        :page="audit.page.value"
        :page-size="audit.pageSize.value"
        :total="audit.total.value"
        :total-pages="audit.totalPages.value"
        :disabled="audit.loading.value"
        @change="audit.setPage"
        @size-change="audit.setPageSize"
      />
    </section>
  </div>
</template>
