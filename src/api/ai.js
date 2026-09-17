import { http, streamNdjson } from './client'
import { toQuery } from './pagination'

export const aiApi = {
  /** 模型下拉列表：本地已下载模型 + 运行状态，refresh 可绕过 30 秒缓存。 */
  models: (refresh = false) => http.get('/ai/models', { query: refresh ? { refresh: '1' } : undefined }),
  running: () => http.get('/ai/running'),

  loadModel: (name) => http.post(`/ai/models/${encodeURIComponent(name)}/load`, {}),
  unloadModel: (name) => http.post(`/ai/models/${encodeURIComponent(name)}/unload`, {}),
  deleteModel: (name) => http.delete(`/ai/models/${encodeURIComponent(name)}`),
  /** 拉取新模型，进度同样是 NDJSON 流：数据帧是 Ollama 的 {status,completed,total}。 */
  pullModel: (name, handlers) => streamNdjson('/ai/pull', { body: { name }, ...handlers }),

  conversations: (params) => http.get('/ai/conversations', { query: toQuery(params) }),
  createConversation: (payload = {}) => http.post('/ai/conversations', payload),
  messages: (id, params) =>
    http.get(`/ai/conversations/${id}/messages`, { query: toQuery(params) }),
  deleteConversation: (id) => http.delete(`/ai/conversations/${id}`),

  /**
   * 流式对话。帧协议见 server/src/utils/ndjson.js：
   * - 控制帧 __railway: meta | thinking | done | error
   * - 数据帧为 Ollama 原始帧，正文在 message.content，思考在 message.thinking
   */
  chat: (payload, handlers) => streamNdjson('/ai/chat', { body: payload, ...handlers }),
}
