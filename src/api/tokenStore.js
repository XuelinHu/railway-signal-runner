/**
 * 令牌与当前用户的本地存储。
 *
 * 只做读写，不含任何业务判断——刷新、跳转登录页这些交给 stores/auth 与 client.js。
 * localStorage 的键统一加 rsr. 前缀，避免同域下与其它应用打架（本机 4029 端口上
 * 曾经跑过别的项目）。
 */

const ACCESS_KEY = 'rsr.accessToken'
const REFRESH_KEY = 'rsr.refreshToken'
const USER_KEY = 'rsr.user'

// 隐私模式或禁用站点数据时 localStorage 会直接抛异常，
// 这时降级成内存存储：刷新页面登录态丢失，但功能不会白屏。
let memoryFallback = null

function storage() {
  if (memoryFallback) return memoryFallback
  try {
    const probe = '__rsr_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    memoryFallback = new Map()
    return {
      getItem: (key) => (memoryFallback.has(key) ? memoryFallback.get(key) : null),
      setItem: (key, value) => memoryFallback.set(key, String(value)),
      removeItem: (key) => memoryFallback.delete(key),
    }
  }
}

function read(key) {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    /* 存不进去也不该让调用方崩掉 */
  }
}

export function getAccessToken() {
  return read(ACCESS_KEY)
}

export function getRefreshToken() {
  return read(REFRESH_KEY)
}

export function getStoredUser() {
  const raw = read(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    // 数据损坏时清掉，避免每次启动都解析失败。
    write(USER_KEY, null)
    return null
  }
}

export function saveSession({ accessToken, refreshToken, user }) {
  if (accessToken !== undefined) write(ACCESS_KEY, accessToken)
  if (refreshToken !== undefined) write(REFRESH_KEY, refreshToken)
  if (user !== undefined) write(USER_KEY, user ? JSON.stringify(user) : null)
}

export function saveUser(user) {
  write(USER_KEY, user ? JSON.stringify(user) : null)
}

export function clearSession() {
  write(ACCESS_KEY, null)
  write(REFRESH_KEY, null)
  write(USER_KEY, null)
}
