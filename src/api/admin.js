import { http } from './client'
import { toQuery } from './pagination'

/**
 * 管理台接口。列表一律走 toQuery 序列化 page/pageSize/筛选/排序，
 * 服务端每个列表都实现了同一套分页信封。
 */
const list = (path) => (params) => http.get(path, { query: toQuery(params) })

export const adminApi = {
  stats: () => http.get('/admin/stats'),
  // 走同一套分页信封，所以这里传 pageSize 而不是 limit。
  recentLogins: (params) =>
    http.get('/admin/stats/recent-logins', { query: toQuery({ pageSize: 10, ...params }) }),

  users: list('/admin/users'),
  createUser: (payload) => http.post('/admin/users', payload),
  updateUser: (id, payload) => http.put(`/admin/users/${id}`, payload),
  deleteUser: (id) => http.delete(`/admin/users/${id}`),
  resetUserPassword: (id, password) =>
    http.post(`/admin/users/${id}/reset-password`, password ? { password } : {}),
  unlockUser: (id) => http.post(`/admin/users/${id}/unlock`, {}),

  loginLogs: list('/admin/login-logs'),
  auditLogs: list('/admin/audit-logs'),
  resetTokens: list('/admin/reset-tokens'),

  scenes: list('/admin/scenes'),
  // 详情单独一个接口：payload 太大，不能并进列表。
  sceneDetail: (id) => http.get(`/admin/scenes/${id}`),
  publishScene: (id) => http.post(`/admin/scenes/${id}/publish`, {}),
  deleteScene: (id) => http.delete(`/admin/scenes/${id}`),

  records: list('/admin/records'),

  conversations: list('/admin/conversations'),
  conversationMessages: (id, params) =>
    http.get(`/admin/conversations/${id}/messages`, { query: toQuery(params) }),
  deleteConversation: (id) => http.delete(`/admin/conversations/${id}`),

  aiLogs: list('/admin/ai-logs'),

  system: () => http.get('/admin/system'),
  refreshModels: () => http.post('/admin/system/refresh-models', {}),
}

export const ROLE_LABELS = {
  student: '学生',
  teacher: '老师',
  admin: '管理员',
}

export const STATUS_LABELS = {
  active: '正常',
  disabled: '已禁用',
  locked: '已锁定',
}
