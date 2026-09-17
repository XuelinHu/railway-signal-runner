<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import AuthLayout from './AuthLayout.vue'

const auth = useAuthStore()
const router = useRouter()

const form = ref({
  username: '',
  password: '',
  confirm: '',
  displayName: '',
  email: '',
  role: 'student',
})

const error = ref('')
const submitting = ref(false)

// 与服务端 passwordSchema 对齐，让用户在提交前就知道规则。
const passwordChecks = computed(() => {
  const value = form.value.password
  return [
    { label: '至少 8 位', ok: value.length >= 8 },
    { label: '包含字母', ok: /[A-Za-z]/.test(value) },
    { label: '包含数字', ok: /[0-9]/.test(value) },
  ]
})
const passwordOk = computed(() => passwordChecks.value.every((item) => item.ok))

async function submit() {
  if (submitting.value) return
  error.value = ''

  if (!passwordOk.value) {
    error.value = '密码不满足要求，请查看下方的密码规则'
    return
  }
  if (form.value.password !== form.value.confirm) {
    error.value = '两次输入的密码不一致'
    return
  }

  submitting.value = true
  try {
    await auth.register({
      username: form.value.username.trim(),
      password: form.value.password,
      displayName: form.value.displayName.trim() || undefined,
      email: form.value.email.trim() || undefined,
      role: form.value.role,
    })
    router.replace('/')
  } catch (err) {
    error.value = err?.message || '注册失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout title="注册账号" subtitle="学生可自助注册；教师账号需由管理员开通">
    <form class="auth-form" @submit.prevent="submit">
      <label class="form-field">
        <span>用户名</span>
        <input
          v-model="form.username"
          type="text"
          autocomplete="username"
          placeholder="3-32 位字母、数字、下划线"
          required
        />
      </label>

      <label class="form-field">
        <span>显示名称</span>
        <input v-model="form.displayName" type="text" placeholder="选填，默认与用户名相同" />
      </label>

      <label class="form-field">
        <span>邮箱</span>
        <input v-model="form.email" type="email" placeholder="选填，用于找回密码" />
      </label>

      <label class="form-field">
        <span>身份</span>
        <select v-model="form.role">
          <option value="student">学生</option>
          <option value="teacher">老师（需管理员开通）</option>
        </select>
      </label>

      <label class="form-field">
        <span>密码</span>
        <input v-model="form.password" type="password" autocomplete="new-password" required />
      </label>

      <ul class="password-rules">
        <li v-for="rule in passwordChecks" :key="rule.label" :class="{ ok: rule.ok }">
          {{ rule.ok ? '✓' : '·' }} {{ rule.label }}
        </li>
      </ul>

      <label class="form-field">
        <span>确认密码</span>
        <input v-model="form.confirm" type="password" autocomplete="new-password" required />
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>

      <button class="btn-primary" type="submit" :disabled="submitting">
        {{ submitting ? '注册中…' : '注册并登录' }}
      </button>
    </form>

    <div class="auth-links">
      <RouterLink to="/login">已有账号？去登录</RouterLink>
    </div>
  </AuthLayout>
</template>
