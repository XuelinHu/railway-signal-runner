<script setup>
import { ref } from 'vue'
import { authApi } from '../../api/auth'
import AuthLayout from './AuthLayout.vue'

const account = ref('')
const submitting = ref(false)
const submitted = ref(false)
const error = ref('')

async function submit() {
  if (submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    await authApi.forgotPassword(account.value.trim())
    submitted.value = true
  } catch (err) {
    error.value = err?.message || '提交失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout title="找回密码" subtitle="本平台未接入邮件服务，重置链接由管理员在后台生成">
    <template v-if="submitted">
      <p class="form-hint ok">已收到你的请求。请联系管理员在「管理台 → 用户管理」中为你生成一次性重置链接。</p>
      <div class="auth-links">
        <RouterLink to="/login">返回登录</RouterLink>
      </div>
    </template>

    <form v-else class="auth-form" @submit.prevent="submit">
      <label class="form-field">
        <span>用户名 / 邮箱 / 手机号</span>
        <input v-model="account" type="text" placeholder="请输入注册时使用的账号" required />
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>

      <button class="btn-primary" type="submit" :disabled="submitting">
        {{ submitting ? '提交中…' : '提交找回申请' }}
      </button>
    </form>
  </AuthLayout>
</template>
