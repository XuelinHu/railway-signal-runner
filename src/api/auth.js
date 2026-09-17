import { http } from './client'

const publicOptions = { skipAuth: true }

export const authApi = {
  register: (payload) => http.post('/auth/register', payload, publicOptions),
  login: (payload) => http.post('/auth/login', payload, publicOptions),
  logout: (payload = {}) => http.post('/auth/logout', payload),
  me: () => http.get('/auth/me'),
  forgotPassword: (account) => http.post('/auth/forgot-password', { account }, publicOptions),
  /** 预检重置链接是否还有效，用于渲染表单前先给提示。 */
  peekReset: (token) => http.get(`/auth/reset-password/${encodeURIComponent(token)}`, publicOptions),
  resetPassword: (token, newPassword) =>
    http.post('/auth/reset-password', { token, newPassword }, publicOptions),
}
