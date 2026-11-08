<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../api/auth'
import AuthLayout from './AuthLayout.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)
const oidcLoading = ref(false)
const oidcEnabled = ref(false)
const devLoginEnabled = ref(false)
const devLoginId = ref('')
const devLoginAccounts = ref([])
const localBrowser = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

// 登录成功后回到被拦截的页面；redirect 由路由守卫写入。
const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'))
const justRegistered = computed(() => route.query.registered === '1')
const justReset = computed(() => route.query.reset === '1')

onMounted(() => {
  if (auth.isAuthenticated) router.replace(redirect.value)
  authApi.oidcConfig().then((value) => { oidcEnabled.value = Boolean(value.enabled) }).catch(() => {})
  if (localBrowser) authApi.devLoginConfig().then((value) => { devLoginEnabled.value = Boolean(value.enabled); devLoginAccounts.value = value.accounts || [] }).catch(() => {})
  const oidcError = sessionStorage.getItem('rsr.oidcError')
  if (oidcError) {
    sessionStorage.removeItem('rsr.oidcError')
    error.value = oidcError
  }
})

async function submit() {
  if (submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    router.replace(redirect.value)
  } catch (err) {
    error.value = err?.message || '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function selectDevAccount(id) {
  const account = devLoginAccounts.value.find((item) => item.id === id)
  if (account) { username.value = account.username; password.value = account.password }
}

async function quickLogin() {
  if (submitting.value || !devLoginEnabled.value || !devLoginId.value) return
  error.value = ''
  const account = devLoginAccounts.value.find((item) => item.id === devLoginId.value)
  if (!account) return
  username.value = account.username
  password.value = account.password
  submitting.value = true
  try {
    await auth.login(account.username, account.password)
    router.replace(account.role === 'admin' ? '/admin' : redirect.value === '/' ? '/student' : redirect.value)
  } catch (err) {
    error.value = err?.message || '测试登录失败'
  } finally {
    submitting.value = false
  }
}

async function signInWithOidc() {
  oidcLoading.value = true
  try {
    const result = await authApi.oidcStart('login', `${window.location.origin}/`)
    window.location.assign(result.authorizationUrl)
  } catch (err) {
    error.value = err?.message || '统一登录暂不可用'
    oidcLoading.value = false
  }
}
</script>

<template>
  <AuthLayout title="登录" subtitle="登录后可使用智能体问答、云端场景与成绩记录">
    <p v-if="justRegistered" class="form-hint ok">注册成功，请使用新账号登录。</p>
    <p v-if="justReset" class="form-hint ok">密码已重置，请使用新密码登录。</p>

    <form class="auth-form" @submit.prevent="submit">
      <label class="form-field">
        <span>用户名</span>
        <input v-model="username" type="text" autocomplete="username" placeholder="请输入用户名" required />
      </label>

      <label class="form-field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="请输入密码"
          required
        />
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>

      <button class="btn-primary" type="submit" :disabled="submitting">
        {{ submitting ? '登录中…' : '登录' }}
      </button>
      <button v-if="oidcEnabled" class="btn-ghost" type="button" :disabled="oidcLoading" @click="signInWithOidc">
        {{ oidcLoading ? '正在跳转…' : '使用统一账号登录' }}
      </button>
    </form>

    <div v-if="devLoginEnabled" class="dev-login-options">
      <label class="form-field">
        <span>本机测试账号</span>
        <select v-model="devLoginId" @change="selectDevAccount(devLoginId)">
          <option value="" disabled>选择测试账号</option>
          <optgroup label="管理员">
            <option v-for="account in devLoginAccounts.filter((item) => item.role === 'admin')" :key="account.id" :value="account.id">{{ account.username }} · {{ account.displayName }}</option>
          </optgroup>
          <optgroup label="普通用户">
            <option v-for="account in devLoginAccounts.filter((item) => item.role === 'student')" :key="account.id" :value="account.id">{{ account.username }} · {{ account.displayName }}</option>
          </optgroup>
        </select>
      </label>
      <button class="btn-ghost" type="button" :disabled="!devLoginId || submitting" @click="quickLogin">{{ submitting ? '登录中…' : '使用选中测试账号登录' }}</button>
    </div>

    <div class="auth-links">
      <RouterLink to="/register">注册新账号</RouterLink>
      <RouterLink to="/forgot-password">忘记密码？</RouterLink>
    </div>
  </AuthLayout>
</template>
