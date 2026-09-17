<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { userApi } from '../api/users'
import PaginationBar from '../components/admin/PaginationBar.vue'

const auth = useAuthStore()
const router = useRouter()

const profile = ref({
  displayName: auth.user?.displayName || '',
  email: auth.user?.email || '',
  phone: auth.user?.phone || '',
})
const profileMessage = ref('')
const profileError = ref('')
const savingProfile = ref(false)

const passwordForm = ref({ current: '', next: '', confirm: '' })
const passwordMessage = ref('')
const passwordError = ref('')
const savingPassword = ref(false)

const passwordChecks = computed(() => {
  const value = passwordForm.value.next
  return [
    { label: '至少 8 位', ok: value.length >= 8 },
    { label: '包含字母', ok: /[A-Za-z]/.test(value) },
    { label: '包含数字', ok: /[0-9]/.test(value) },
  ]
})
const passwordOk = computed(() => passwordChecks.value.every((item) => item.ok))

const conversations = ref({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 })
const loadingConversations = ref(false)

async function loadConversations(page = 1) {
  loadingConversations.value = true
  try {
    const data = await userApi.conversations({ page, pageSize: conversations.value.pageSize })
    conversations.value = {
      items: data.items ?? [],
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 10,
      total: data.total ?? 0,
      totalPages: data.totalPages ?? 1,
    }
  } catch {
    // 会话列表失败不该影响资料与改密，静默即可。
  } finally {
    loadingConversations.value = false
  }
}

onMounted(() => loadConversations(1))

async function saveProfile() {
  savingProfile.value = true
  profileMessage.value = ''
  profileError.value = ''
  try {
    await auth.updateProfile({
      displayName: profile.value.displayName.trim(),
      email: profile.value.email.trim() || null,
      phone: profile.value.phone.trim() || null,
    })
    profileMessage.value = '资料已保存'
  } catch (error) {
    profileError.value = error?.message || '保存失败'
  } finally {
    savingProfile.value = false
  }
}

async function submitPassword() {
  passwordMessage.value = ''
  passwordError.value = ''

  if (!passwordOk.value) {
    passwordError.value = '新密码不满足要求'
    return
  }
  if (passwordForm.value.next !== passwordForm.value.confirm) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }

  savingPassword.value = true
  try {
    await auth.changePassword(passwordForm.value.current, passwordForm.value.next)
    // 服务端已吊销全部令牌，本地会话也清了，只能重新登录。
    router.replace('/login?reset=1')
  } catch (error) {
    passwordError.value = error?.message || '修改失败'
  } finally {
    savingPassword.value = false
  }
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN')
}
</script>

<template>
  <main class="account-page">
    <header class="account-header">
      <div>
        <RouterLink class="auth-back" to="/">← 返回身份选择</RouterLink>
        <h1>我的账号</h1>
        <p class="account-sub">
          {{ auth.displayName }}（{{ auth.user?.username }}） · {{ auth.roleLabel }}
        </p>
      </div>
      <div class="account-actions">
        <RouterLink v-if="auth.isAdmin" class="btn-ghost" to="/admin">进入管理台</RouterLink>
        <button class="btn-ghost" type="button" @click="auth.logout().then(() => router.push('/login'))">
          退出登录
        </button>
      </div>
    </header>

    <div class="account-grid">
      <section class="panel">
        <h2>基本资料</h2>
        <form class="auth-form" @submit.prevent="saveProfile">
          <label class="form-field">
            <span>显示名称</span>
            <input v-model="profile.displayName" type="text" maxlength="32" />
          </label>
          <label class="form-field">
            <span>邮箱</span>
            <input v-model="profile.email" type="email" placeholder="选填" />
          </label>
          <label class="form-field">
            <span>手机号</span>
            <input v-model="profile.phone" type="text" placeholder="选填" />
          </label>
          <p v-if="profileMessage" class="form-hint ok">{{ profileMessage }}</p>
          <p v-if="profileError" class="form-error">{{ profileError }}</p>
          <button class="btn-primary" type="submit" :disabled="savingProfile">
            {{ savingProfile ? '保存中…' : '保存资料' }}
          </button>
        </form>
      </section>

      <section class="panel">
        <h2>修改密码</h2>
        <p class="panel-hint">修改后所有设备都需要重新登录。</p>
        <form class="auth-form" @submit.prevent="submitPassword">
          <label class="form-field">
            <span>当前密码</span>
            <input v-model="passwordForm.current" type="password" autocomplete="current-password" required />
          </label>
          <label class="form-field">
            <span>新密码</span>
            <input v-model="passwordForm.next" type="password" autocomplete="new-password" required />
          </label>
          <ul class="password-rules">
            <li v-for="rule in passwordChecks" :key="rule.label" :class="{ ok: rule.ok }">
              {{ rule.ok ? '✓' : '·' }} {{ rule.label }}
            </li>
          </ul>
          <label class="form-field">
            <span>确认新密码</span>
            <input v-model="passwordForm.confirm" type="password" autocomplete="new-password" required />
          </label>
          <p v-if="passwordError" class="form-error">{{ passwordError }}</p>
          <button class="btn-primary" type="submit" :disabled="savingPassword">
            {{ savingPassword ? '提交中…' : '修改密码' }}
          </button>
        </form>
      </section>
    </div>

    <section class="panel">
      <h2>我的智能体会话</h2>
      <p v-if="loadingConversations" class="panel-hint">加载中…</p>
      <p v-else-if="conversations.items.length === 0" class="panel-hint">还没有会话记录。</p>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>模型</th>
            <th>消息数</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in conversations.items" :key="item.id">
            <td>{{ item.title || '未命名会话' }}</td>
            <td>{{ item.model || '—' }}</td>
            <td>{{ item.message_count ?? '—' }}</td>
            <td>{{ formatTime(item.updated_at) }}</td>
          </tr>
        </tbody>
      </table>
      <PaginationBar
        v-if="conversations.total > 0"
        :page="conversations.page"
        :page-size="conversations.pageSize"
        :total="conversations.total"
        :total-pages="conversations.totalPages"
        @change="loadConversations"
      />
    </section>
  </main>
</template>
