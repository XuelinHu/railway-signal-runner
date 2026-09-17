<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import AuthLayout from './AuthLayout.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

// 登录成功后回到被拦截的页面；redirect 由路由守卫写入。
const redirect = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/'))
const justRegistered = computed(() => route.query.registered === '1')
const justReset = computed(() => route.query.reset === '1')

onMounted(() => {
  if (auth.isAuthenticated) router.replace(redirect.value)
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
    </form>

    <div class="auth-links">
      <RouterLink to="/register">注册新账号</RouterLink>
      <RouterLink to="/forgot-password">忘记密码？</RouterLink>
    </div>
  </AuthLayout>
</template>
