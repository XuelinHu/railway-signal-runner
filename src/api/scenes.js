import { http } from './client'
import { toQuery } from './pagination'

export const sceneApi = {
  /** 未登录也能读已发布场景，登录后可额外看到自己的草稿。 */
  list: (params) => http.get('/scenes', { query: toQuery(params) }),
  get: (id) => http.get(`/scenes/${id}`),
  create: (payload) => http.post('/scenes', payload),
  publish: (id) => http.post(`/scenes/${id}/publish`, {}),
  remove: (id) => http.delete(`/scenes/${id}`),
}

export const recordApi = {
  list: (params) => http.get('/records', { query: toQuery(params) }),
  create: (payload) => http.post('/records', payload),
}
