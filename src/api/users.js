import { http } from './client'
import { toQuery } from './pagination'

export const userApi = {
  updateProfile: (payload) => http.put('/users/me', payload),
  changePassword: (currentPassword, newPassword) =>
    http.post('/users/me/password', { currentPassword, newPassword }),
  conversations: (params) => http.get('/users/me/conversations', { query: toQuery(params) }),
}
