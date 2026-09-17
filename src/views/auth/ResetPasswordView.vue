<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '../../api/auth'
import AuthLayout from './AuthLayout.vue'

const route = useRoute()
const router = useRouter()

const token = computed(() => String(route.params.token || route.query.token || ''))
const checking = ref(true)
const tokenValid = ref(false)
const tokenMessage = ref('')
const username = ref('')

const password = ref('')
const confirm = ref('')
const error = ref('')
const submitting = ref(false)

const passwordChecks = computed(() => {
  const value = password.value
  return [
    { label: '至少 8 位', ok: value.length >= 8 },
    { label: '包含字母', ok: /[A-Za-z]/.test(value) },
    { label: '包含数字', ok: /[0-9]/.test(value) },
  ]
})
const passwordOk = computed(() => passwordChecks.value.every((item) => item.ok))

// 先预检令牌：链接过期或被用过时，直接给结论而不是让用户填完表单才报错。
onMounted(async () => {
  if (!token.value) {
    tokenValid.value = false
    tokenMessage.value = '重置链接不完整，请向管理员重新索取'
    checking.value = false
    return
  }
  try {
    const data = await authApi.peekReset(token.value)
    tokenValid.value = Boolean(data.valid)
    username.value = data.username || ''
  } catch (err) {
    tokenValid.value = false
    tokenMessage.value = err?.message || '重置链接无效'
  } finally {
    checking.value = false
  }
})

async function submit() {
  if (submitting.value) return
  error.value = ''

  if (!passwordOk.value) {
    error.value = '密码不满足要求，请查看下方的密码规则'
    return
  }
  if (password.value !== confirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  submitting.value = true
  try {
    await authApi.resetPassword(token.value, password.value)
    router.replace('/login?reset=1')
  } catch (err) {
    error.value = err?.message || '重置失败，请重新索取链接'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout title="重置密码">
    <p v-if="checking" class="form-hint">正在校验重置链接…</p>

    <template v-else-if="!tokenValid">
      <p class="form-error">{{ tokenMessage }}</p>
      <div class="auth-links">
        <RouterLink to="/forgot-password">重新申请</RouterLink>
        <RouterLink to="/login">返回登录</RouterLink>
      </div>
    </template>

    <form v-else class="auth-form" @submit.prevent="submit">
      <p class="form-hint ok">正在为账号「{{ username }}」设置新密码</p>

      <label class="form-field">
        <span>新密码</span>
        <input v-model="password" type="password" autocomplete="new-password" required />
      </label>

      <ul class="password-rules">
        <li v-for="rule in passwordChecks" :key="rule.label" :class="{ ok: rule.ok }">
          {{ rule.ok ? '✓' : '·' }} {{ rule.label }}
        </li>
      </ul>

      <label class="form-field">
        <span>确认新密码</span>
        <input v-model="confirm" type="password" autocomplete="new-password" required />
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>

      <button class="btn-primary" type="submit" :disabled="submitting">
        {{ submitting ? '提交中…' : '确认重置' }}
      </button>
    </form>
  </AuthLayout>
</template>
