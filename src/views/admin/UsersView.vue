<script setup>
/**
 * 用户管理：分页列表 + 筛选 + 新建/编辑弹框 + 重置密码 / 解锁 / 删除。
 *
 * 两个有意为之的细节：
 * 1. 删除是软删（服务端只置 deleted_at），所以列表刷新后用户就消失了，但数据仍在。
 * 2. 管理员不能改自己的角色/状态、不能删自己——服务端也会拦，这里先在前端禁掉，
 *    避免点了才报错。
 */
import { computed, reactive, ref } from 'vue'
import { Plus, RefreshCw, Search } from '@lucide/vue'
import { adminApi, ROLE_LABELS, STATUS_LABELS } from '../../api/admin'
import { formatDateTime } from '../../api/format'
import { useAuthStore } from '../../stores/auth'
import AdminTable from '../../components/admin/AdminTable.vue'
import PaginationBar from '../../components/admin/PaginationBar.vue'
import { usePagedQuery } from '../../composables/usePagedQuery'

const auth = useAuthStore()

const query = usePagedQuery(adminApi.users, {
  pageSize: 20,
  initialFilters: { q: '', role: '', status: '' },
})

const columns = [
  { key: 'username', label: '用户名', sortable: true },
  { key: 'display_name', label: '姓名' },
  { key: 'role', label: '角色', width: '90px', sortable: true },
  { key: 'status', label: '状态', width: '100px', sortable: true },
  { key: 'email', label: '邮箱' },
  { key: 'last_login_at', label: '最近登录', width: '180px', sortable: true, format: formatDateTime },
]

/* ------------------------------- 新建 / 编辑弹框 ------------------------------- */

const editor = reactive({
  open: false,
  mode: 'create',
  id: '',
  submitting: false,
  error: '',
  form: { username: '', displayName: '', email: '', phone: '', role: 'student', status: 'active', password: '' },
})

const editorTitle = computed(() => (editor.mode === 'create' ? '新建用户' : '编辑用户'))

function openCreate() {
  editor.mode = 'create'
  editor.id = ''
  editor.error = ''
  editor.form = { username: '', displayName: '', email: '', phone: '', role: 'student', status: 'active', password: '' }
  editor.open = true
}

function openEdit(row) {
  editor.mode = 'edit'
  editor.id = row.id
  editor.error = ''
  editor.form = {
    username: row.username,
    displayName: row.display_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.role,
    status: row.status,
    password: '',
  }
  editor.open = true
}

function closeEditor() {
  editor.open = false
}

async function submitEditor() {
  editor.submitting = true
  editor.error = ''
  try {
    const payload = { ...editor.form }
    // 空字符串对后端是「不设置」，但 email 的 zod 校验不接受空串，统一转成 null。
    if (!payload.email) payload.email = null
    if (!payload.phone) payload.phone = null

    if (editor.mode === 'create') {
      if (!payload.password) delete payload.password
      const result = await adminApi.createUser(payload)
      // 没填密码时服务端会自动生成一个并只在响应里回显一次，必须让管理员看到。
      if (result.initialPassword) {
        notice.value = {
          tone: 'ok',
          text: `用户 ${result.user.username} 已创建，初始密码：${result.initialPassword}（请立即转交，此密码只显示这一次）`,
        }
      } else {
        notice.value = { tone: 'ok', text: `用户 ${result.user.username} 已创建` }
      }
    } else {
      delete payload.password
      delete payload.username
      await adminApi.updateUser(editor.id, payload)
      notice.value = { tone: 'ok', text: '用户信息已更新' }
    }

    editor.open = false
    await query.reload()
  } catch (error) {
    editor.error = error?.message || '保存失败'
  } finally {
    editor.submitting = false
  }
}

/* ------------------------------- 行操作 ------------------------------- */

const notice = ref(null)
const busyId = ref('')

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

async function toggleStatus(row) {
  const next = row.status === 'disabled' ? 'active' : 'disabled'
  await run(row, () => adminApi.updateUser(row.id, { status: next }), next === 'disabled' ? '账号已禁用' : '账号已启用')
}

function unlock(row) {
  return run(row, () => adminApi.unlockUser(row.id), `账号 ${row.username} 已解锁`)
}

const resetResult = ref(null)

async function resetPassword(row) {
  busyId.value = row.id
  notice.value = null
  try {
    const result = await adminApi.resetUserPassword(row.id)
    resetResult.value = { username: row.username, ...result }
  } catch (error) {
    notice.value = { tone: 'error', text: error?.message || '生成重置链接失败' }
  } finally {
    busyId.value = ''
  }
}

async function removeUser(row) {
  const ok = window.confirm(`确定删除用户 ${row.username} 吗？该账号将无法再登录。`)
  if (!ok) return
  await run(row, () => adminApi.deleteUser(row.id), `用户 ${row.username} 已删除`)
}

/** 前端用 hash 路由，所以完整链接是 origin + pathname + #/reset-password/<token>。 */
const resetLink = computed(() =>
  resetResult.value
    ? `${window.location.origin}${window.location.pathname}#/reset-password/${resetResult.value.token}`
    : ''
)

async function copyResetLink() {
  try {
    await navigator.clipboard.writeText(resetLink.value)
    notice.value = { tone: 'ok', text: '重置链接已复制到剪贴板' }
  } catch {
    // 剪贴板在非安全上下文（http 公网地址）下会被拒，此时让管理员手动选中复制。
    notice.value = { tone: 'error', text: '浏览器拒绝了剪贴板写入，请手动选中链接复制' }
    return
  }
  resetResult.value = null
}

const isSelf = (row) => row.id === auth.user?.id
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <h1 class="admin-page-title">用户管理</h1>
      <button class="btn-primary" type="button" @click="openCreate">
        <Plus :size="16" /> 新建用户
      </button>
    </header>

    <div class="filter-bar">
      <label class="filter-item">
        <Search :size="15" />
        <input v-model="query.filters.q" type="search" placeholder="搜索用户名 / 姓名" />
      </label>

      <label class="filter-item">
        角色
        <select v-model="query.filters.role">
          <option value="">全部</option>
          <option v-for="(label, value) in ROLE_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>

      <label class="filter-item">
        状态
        <select v-model="query.filters.status">
          <option value="">全部</option>
          <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>

      <button class="btn-ghost" type="button" @click="query.reload()">
        <RefreshCw :size="15" /> 刷新
      </button>
    </div>

    <p v-if="notice" class="notice" :class="notice.tone">{{ notice.text }}</p>

    <section class="panel">
      <AdminTable
        :columns="columns"
        :rows="query.items.value"
        :loading="query.loading.value"
        :error="query.error.value"
        :sort="query.sort.value"
        :order="query.order.value"
        empty-text="没有匹配的用户"
        @sort="query.setSort"
      >
        <template #cell-role="{ value }">
          <span class="tag">{{ ROLE_LABELS[value] || value }}</span>
        </template>

        <template #cell-status="{ value }">
          <span class="tag" :class="`status-${value}`">{{ STATUS_LABELS[value] || value }}</span>
        </template>

        <template #row-actions="{ row }">
          <button class="link-btn" type="button" @click="openEdit(row)">编辑</button>
          <button class="link-btn" type="button" :disabled="busyId === row.id" @click="resetPassword(row)">
            重置密码
          </button>
          <button
            v-if="row.status === 'locked'"
            class="link-btn"
            type="button"
            :disabled="busyId === row.id"
            @click="unlock(row)"
          >
            解锁
          </button>
          <button
            class="link-btn"
            type="button"
            :disabled="busyId === row.id || isSelf(row)"
            :title="isSelf(row) ? '不能禁用自己的账号' : ''"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'disabled' ? '启用' : '禁用' }}
          </button>
          <button
            class="link-btn danger"
            type="button"
            :disabled="busyId === row.id || isSelf(row)"
            :title="isSelf(row) ? '不能删除自己的账号' : ''"
            @click="removeUser(row)"
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

    <!-- 新建 / 编辑 -->
    <div v-if="editor.open" class="modal-mask" @click.self="closeEditor">
      <div class="modal">
        <header class="modal-head">
          <h2>{{ editorTitle }}</h2>
          <button class="link-btn" type="button" @click="closeEditor">关闭</button>
        </header>

        <div class="modal-body">
          <label class="form-field">
            <span>用户名</span>
            <input v-model="editor.form.username" :disabled="editor.mode === 'edit'" placeholder="登录名，3-32 位" />
          </label>

          <label class="form-field">
            <span>姓名</span>
            <input v-model="editor.form.displayName" placeholder="留空则与用户名相同" />
          </label>

          <label class="form-field">
            <span>角色</span>
            <select v-model="editor.form.role">
              <option v-for="(label, value) in ROLE_LABELS" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>

          <label class="form-field">
            <span>状态</span>
            <select v-model="editor.form.status">
              <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>

          <label class="form-field">
            <span>邮箱</span>
            <input v-model="editor.form.email" type="email" placeholder="选填" />
          </label>

          <label class="form-field">
            <span>手机号</span>
            <input v-model="editor.form.phone" placeholder="选填，6-20 位数字" />
          </label>

          <label v-if="editor.mode === 'create'" class="form-field">
            <span>初始密码</span>
            <input v-model="editor.form.password" type="text" placeholder="留空则自动生成，并强制首次登录修改" />
          </label>

          <p v-if="editor.error" class="form-error">{{ editor.error }}</p>
        </div>

        <footer class="modal-foot">
          <button class="btn-ghost" type="button" @click="closeEditor">取消</button>
          <button class="btn-primary" type="button" :disabled="editor.submitting" @click="submitEditor">
            {{ editor.submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- 重置密码结果：一次性链接，只显示这一次 -->
    <div v-if="resetResult" class="modal-mask" @click.self="resetResult = null">
      <div class="modal">
        <header class="modal-head">
          <h2>重置链接已生成</h2>
          <button class="link-btn" type="button" @click="resetResult = null">关闭</button>
        </header>

        <div class="modal-body">
          <p class="panel-hint">
            本机未配置邮件服务，请把下面的链接转交给
            <strong>{{ resetResult.username }}</strong>，由本人打开后设置新密码。
            链接 30 分钟内有效，且只能使用一次。
          </p>
          <code class="reset-link">{{ resetLink }}</code>
          <p class="panel-hint">
            过期时间：{{ formatDateTime(resetResult.expiresAt) }}
          </p>
        </div>

        <footer class="modal-foot">
          <button class="btn-primary" type="button" @click="copyResetLink">复制完整链接</button>
        </footer>
      </div>
    </div>
  </div>
</template>
