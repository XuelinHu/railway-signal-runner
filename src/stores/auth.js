import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '../api/auth'
import { userApi } from '../api/users'
import { onAuthFailure } from '../api/client'
import {
  clearSession,
  getAccessToken,
  getStoredUser,
  saveSession,
  saveUser,
} from '../api/tokenStore'

export const ROLE_LABELS = {
  student: '学生',
  teacher: '老师',
  admin: '管理员',
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(getStoredUser())
  const accessToken = ref(getAccessToken())
  // idle → hydrating → ready。路由守卫靠它避免"刷新页面被误判成未登录"。
  const status = ref('idle')

  const isAuthenticated = computed(() => Boolean(user.value && accessToken.value))
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isTeacher = computed(() => user.value?.role === 'teacher' || isAdmin.value)
  const roleLabel = computed(() => ROLE_LABELS[user.value?.role] ?? '访客')
  const displayName = computed(() => user.value?.displayName || user.value?.username || '')

  /** 认证彻底失效时的统一出口：清干净并跳登录页。 */
  let onSignedOut = null
  function setSignedOutHandler(handler) {
    onSignedOut = handler
  }

  onAuthFailure((reason) => {
    clear()
    onSignedOut?.(reason)
  })

  function applySession(payload) {
    accessToken.value = payload.accessToken
    user.value = payload.user
    saveSession(payload)
  }

  function clear() {
    accessToken.value = null
    user.value = null
    clearSession()
  }

  /**
   * 启动时调用一次：有令牌就回库确认用户仍然有效。
   * 不能只信 localStorage 里的用户快照——账号可能已被禁用或改角色。
   */
  async function hydrate() {
    if (status.value === 'ready') return
    status.value = 'hydrating'

    if (!getAccessToken()) {
      clear()
      status.value = 'ready'
      return
    }

    try {
      const data = await authApi.me()
      user.value = data.user
      saveUser(data.user)
    } catch (error) {
      // 401 已由 client.js 触发 onAuthFailure 清session；其它错误（断网）
      // 保留本地快照，让用户还能看到界面，只是写操作会失败。
      if (error?.status === 401) clear()
    } finally {
      status.value = 'ready'
    }
  }

  async function login(username, password) {
    const data = await authApi.login({ username, password })
    applySession(data)
    status.value = 'ready'
    return data.user
  }

  async function register(payload) {
    await authApi.register(payload)
    // 注册成功后直接登录，省掉一次手动输入。
    return login(payload.username, payload.password)
  }

  async function logout() {
    try {
      await authApi.logout({ all: false })
    } catch {
      // 服务端吊销失败也要让本地退出，否则用户会卡在"退不出去"的状态。
    }
    clear()
  }

  async function updateProfile(payload) {
    const data = await userApi.updateProfile(payload)
    user.value = data.user
    saveUser(data.user)
    return data.user
  }

  /**
   * 修改密码。服务端会吊销该用户【全部】刷新令牌——这是有意的：
   * 账号被盗后改密码必须能踢掉攻击者的会话。代价是本机也要重新登录，
   * 所以这里直接清空会话，由调用方引导用户去登录页。
   */
  async function changePassword(currentPassword, newPassword) {
    const data = await userApi.changePassword(currentPassword, newPassword)
    clear()
    return data
  }

  function hasRole(...roles) {
    return Boolean(user.value && roles.includes(user.value.role))
  }

  return {
    user,
    accessToken,
    status,
    isAuthenticated,
    isAdmin,
    isTeacher,
    roleLabel,
    displayName,
    setSignedOutHandler,
    hydrate,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    hasRole,
    clear,
  }
})
